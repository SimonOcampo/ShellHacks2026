"""Scaffold loader for agency Work Zone Data Exchange GeoJSON feeds."""
import json
from pathlib import Path

def load(path: Path) -> list[dict]:
    """Load saved WZDx FeatureCollection and validate top-level feature structure."""
    doc=json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(doc.get("features"),list): raise ValueError("WZDx source is not a GeoJSON FeatureCollection")
    return doc["features"]
