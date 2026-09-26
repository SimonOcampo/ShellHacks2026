"""Download immutable Census TIGER/Line All Lines county edge snapshots."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed

from src.common.http import fetch
from src.config.settings import GEOGRAPHY_YEAR, RAW


def download(county_map, year: int = GEOGRAPHY_YEAR) -> dict[str, tuple[str, str]]:
    """Fetch All Lines edge ZIPs for the unique counties used by project CBSAs."""
    counties = sorted({str(value).zfill(5) for value in county_map.county_geoid})
    result = {}

    def one(county):
        url = f"https://www2.census.gov/geo/tiger/TIGER{year}/EDGES/tl_{year}_{county}_edges.zip"
        path, digest = fetch(
            url,
            RAW / "roads" / f"tiger_{year}" / f"tl_{year}_{county}_edges.zip",
            timeout=180,
        )
        return county, (str(path), digest)

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(one, county) for county in counties]
        for future in as_completed(futures):
            county, value = future.result()
            result[county] = value
    return result
