"""Download Census LEHD LODES origin-destination state files."""
from src.common.http import fetch
from src.config.settings import RAW

YEAR = 2022
BASE = "https://lehd.ces.census.gov/data/lodes/LODES8/{state}/od/{state}_od_main_JT00_{year}.csv.gz"

def download(states: set[str], year: int = YEAR) -> dict[str, tuple[str, str]]:
    """Fetch OD main-job files by state; multi-state CBSAs require every member state."""
    result = {}
    for state in sorted(states):
        url = BASE.format(state=state.lower(), year=year)
        path, digest = fetch(url, RAW / "lodes" / str(year) / f"{state.lower()}_od_main_JT00_{year}.csv.gz")
        result[state] = (str(path), digest)
    return result
