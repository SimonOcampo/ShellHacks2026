"""Downloads Census TIGER/Line CBSA and county boundary archives."""
from src.config.settings import RAW, GEOGRAPHY_YEAR
from src.config.datasets import CENSUS_CBSA, CENSUS_COUNTY
from src.common.http import fetch

def download() -> dict[str, tuple[str, str]]:
    """Download raw boundaries and return archive path/hash for each layer."""
    out = {}
    for name, url in [("cbsa", CENSUS_CBSA), ("county", CENSUS_COUNTY)]:
        path, digest = fetch(url, RAW / "census" / f"{name}_{GEOGRAPHY_YEAR}.zip")
        out[name] = (str(path), digest)
    return out

if __name__ == "__main__":
    print(download())
