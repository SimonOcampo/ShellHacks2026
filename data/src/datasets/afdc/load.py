"""Load AFDC station API snapshots."""
import json
from pathlib import Path

def load(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    stations = payload.get("fuel_stations")
    if not isinstance(stations, list):
        raise ValueError(f"AFDC response lacks fuel_stations: {path}")
    return stations
