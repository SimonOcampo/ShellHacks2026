"""Download agency GTFS archives from an explicit public feed URL list."""
import json
from pathlib import Path
from src.common.http import fetch
from src.config.settings import RAW

def download(feed_urls: dict[str, str]) -> dict[str, tuple[str, str]]:
    """Retrieve only feeds configured by the operator; feed selection remains auditable."""
    index = RAW / "transit" / "feed_urls.json"; index.parent.mkdir(parents=True, exist_ok=True)
    index.write_text(json.dumps(feed_urls, indent=2, sort_keys=True), encoding="utf-8")
    return {name: tuple(map(str, fetch(url, RAW / "transit" / f"{name}.zip"))) for name, url in sorted(feed_urls.items())}
