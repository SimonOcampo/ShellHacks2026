"""Parse Census API JSON tables without changing the preserved raw source."""
import json
from pathlib import Path
from typing import Any

def load_api_table(path: Path) -> list[dict[str, Any]]:
    """Convert the header-row Census JSON format into records."""
    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"Empty or invalid Census response: {path}")
    if len(rows) == 1:
        return []
    return [dict(zip(rows[0], row)) for row in rows[1:]]
