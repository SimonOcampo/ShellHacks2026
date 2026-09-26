"""Load core static GTFS text tables from a feed archive."""
from pathlib import Path
from zipfile import ZipFile
import pandas as pd

def load(path: Path) -> dict[str, pd.DataFrame]:
    """Read routes, stops, trips, stop_times and calendar when present."""
    result = {}
    with ZipFile(path) as archive:
        for table in ("routes", "stops", "trips", "stop_times", "calendar", "calendar_dates"):
            name = next((n for n in archive.namelist() if n.lower() == f"{table}.txt"), None)
            if name:
                with archive.open(name) as stream:
                    result[table] = pd.read_csv(stream, dtype="string", low_memory=False)
    if "stops" not in result or "routes" not in result:
        raise ValueError(f"GTFS archive {path} lacks required stops.txt or routes.txt")
    return result
