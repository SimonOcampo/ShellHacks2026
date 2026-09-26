"""Aggregate published ACS estimates to official CBSA geography."""
from pathlib import Path
from src.config.settings import ACS_YEAR
from .load import load_api_table
from .variables import *

def process(metro_path: Path, county_path: Path, profile_path: Path, county_map) -> dict[str, dict]:
    """Return ACS metrics keyed by CBSA GEOID; county membership covers all states."""
    metros = load_api_table(metro_path)
    counties = load_api_table(county_path)
    profile_rows = load_api_table(profile_path)
    commute_by_cbsa = {str(r.get("metropolitan statistical area/micropolitan statistical area", "")).zfill(5): r.get("DP03_0025E") for r in profile_rows}
    county_to_cbsa = {}
    for row in county_map.itertuples(index=False):
        county_to_cbsa[str(row.county_geoid)] = str(row.cbsa_code)
    county_pop = {c: {} for c in set(county_to_cbsa.values())}
    for row in counties:
        fips = str(row["state"]).zfill(2) + str(row["county"]).zfill(3)
        if fips in county_to_cbsa:
            value = row.get(POPULATION)
            if value not in (None, "-", "", "null"):
                county_pop[county_to_cbsa[fips]][fips] = int(value)
    result = {}
    for row in metros:
        code = str(row.get("metropolitan statistical area/micropolitan statistical area", "")).zfill(5)
        try:
            pop = int(row[POPULATION]); hh = int(row[HOUSEHOLDS]); zero = int(row[ZERO_VEHICLE_HOUSEHOLDS])
            workers = int(row[WORKERS]); transit = int(row[TRANSIT_WORKERS])
            commute_raw = commute_by_cbsa.get(code)
            commute = float(commute_raw) if commute_raw not in (None, "-", "", "null") else None
        except (KeyError, TypeError, ValueError):
            continue
        result[code] = {"population": pop, "households": hh, "zero_vehicle_households": zero,
                        "workers": workers, "transit_workers": transit, "mean_commute_minutes": commute,
                        "zero_vehicle_household_share": zero / hh if hh else None,
                        "transit_commute_share": transit / workers if workers else None,
                        "county_populations": county_pop.get(code, {}), "acs_name": row.get("NAME"), "year": ACS_YEAR}
    return result
