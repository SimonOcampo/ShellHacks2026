"""Download ACS 5-year CBSA and county tables as raw JSON responses."""
from pathlib import Path
import json
from src.common.http import fetch
from src.config.settings import RAW, ACS_YEAR
from src.config.datasets import ACS_URL
from .variables import VARIABLES

def download(year: int = ACS_YEAR) -> tuple[Path, Path, Path]:
    """Retrieve all CBSA observations and all county observations for required tables."""
    base = ACS_URL.format(year=year)
    profile_base = f"https://api.census.gov/data/{year}/acs/acs5/profile"
    key = __import__("os").getenv("CENSUS_API_KEY")
    if not key:
        raise RuntimeError("CENSUS_API_KEY is required by the current Census Data API. Set it in .env; the pipeline will not substitute estimates.")
    params = {"get": ",".join(VARIABLES), "for": "metropolitan statistical area/micropolitan statistical area:*"}
    county_params = {"get": ",".join(VARIABLES[:2]), "for": "county:*", "in": "state:*"}
    profile_params = {"get": "NAME,DP03_0025E", "for": "metropolitan statistical area/micropolitan statistical area:*"}
    if key:
        params["key"] = key
        county_params["key"] = key
        profile_params["key"] = key
    metro, _ = fetch(base, RAW / "acs" / f"acs5_{year}_cbsa_keyed.json", params=params)
    county, _ = fetch(base, RAW / "acs" / f"acs5_{year}_county_keyed.json", params=county_params)
    profile, _ = fetch(profile_base, RAW / "acs" / f"acs5_{year}_profile_cbsa_keyed.json", params=profile_params)
    # Reject HTML/error payloads early. Preserve original response regardless for audit.
    for path in (metro, county, profile):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise RuntimeError(f"Census returned a non-JSON/error response; inspect preserved file {path}") from exc
    return metro, county, profile

def download_tracts(state_fips: set[str], year: int = ACS_YEAR) -> dict[str, Path]:
    """Retrieve tract-level ACS rows state by state for retained CBSA simulation detail."""
    import os
    key=os.getenv("CENSUS_API_KEY")
    if not key:
        raise RuntimeError("CENSUS_API_KEY is required to retrieve tract-level ACS rows")
    url=ACS_URL.format(year=year); out={}
    for state in sorted(state_fips):
        params={"get":",".join(VARIABLES[:-1]),"for":"tract:*","in":f"state:{state}","key":key}
        path,_=fetch(url,RAW/"acs"/f"acs5_{year}_tract_state_{state}.json",params=params,timeout=120)
        json.loads(path.read_text(encoding="utf-8"))
        out[state]=path
    return out

if __name__ == "__main__":
    import argparse
    parser=argparse.ArgumentParser(); parser.add_argument("--year",type=int,default=ACS_YEAR)
    print(download(parser.parse_args().year))
