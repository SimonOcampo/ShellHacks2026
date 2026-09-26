"""Parse NOAA CDO JSON responses."""
import json
from pathlib import Path

def load(path: Path) -> list[dict]:
    """Return station records from a saved CDO response."""
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("results", [])
