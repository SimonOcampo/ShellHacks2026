"""Read saved ACS data-profile mean commute estimates for CBSA fallback values."""
from __future__ import annotations

import math
from pathlib import Path
from urllib.parse import urlencode

from src.common.provenance import provenance
from src.config.settings import ACS_YEAR, RAW
from .load import load_api_table


def mean_commutes(path: Path) -> dict[str, float]:
    """Use published DP03_0025E estimates; reject missing and sentinel values."""
    result = {}
    for row in load_api_table(path):
        code = str(row.get("metropolitan statistical area/micropolitan statistical area", ""))
        if len(code) != 5 or not code.isdigit():
            continue
        try:
            value = float(row["DP03_0025E"])
        except (KeyError, TypeError, ValueError):
            continue
        if math.isfinite(value) and value >= 0:
            result[code] = value
    return result


def find_saved_profile(required_codes: set[str], year: int = ACS_YEAR) -> Path | None:
    """Find a preserved profile response containing every needed CBSA."""
    if not required_codes:
        return None
    candidates = sorted(
        (RAW / "acs").glob(f"acs5_{year}_profile*.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for path in candidates:
        try:
            if required_codes <= mean_commutes(path).keys():
                return path
        except (OSError, TypeError, ValueError):
            continue
    return None


def commute_provenance(path: Path, cbsa: str, year: int = ACS_YEAR):
    """Describe a direct Census profile estimate for one CBSA."""
    params = {
        "get": "NAME,DP03_0025E",
        "for": "metropolitan statistical area/micropolitan statistical area:*",
    }
    source_url = f"https://api.census.gov/data/{year}/acs/acs5/profile?{urlencode(params)}"
    return provenance(
        source_name="U.S. Census ACS 5-Year Data Profiles",
        source_url=source_url,
        dataset_id=f"acs5_profile_{year}",
        period=str(year),
        raw_path=path,
        source_geography=f"Census CBSA {cbsa}",
        target_geography=f"Census CBSA {cbsa}",
        transformation=f"Use published DP03_0025E mean travel time to work in minutes for CBSA {cbsa}.",
        assumptions=[
            "Published ACS 5-year profile estimate is used directly; no imputation or zero substitution.",
        ],
    )
