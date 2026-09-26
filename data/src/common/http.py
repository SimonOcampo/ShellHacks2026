"""Retrying HTTP client with immutable, deterministic raw snapshots."""
from pathlib import Path
import logging, time
import requests
from .hashing import sha256_file
log = logging.getLogger(__name__)

def fetch(url: str, destination: Path, *, params: dict | None = None, timeout: int = 60, attempts: int = 4) -> tuple[Path, str]:
    """Fetch and preserve response bytes; never replace a previous raw snapshot."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        return destination, sha256_file(destination)
    last = None
    for attempt in range(attempts):
        try:
            response = requests.get(url, params=params, timeout=timeout, headers={"User-Agent": "ODD-Scout-data-pipeline/0.1 (reproducible research)"})
            response.raise_for_status()
            temp = destination.with_suffix(destination.suffix + ".partial")
            temp.write_bytes(response.content)
            temp.replace(destination)
            return destination, sha256_file(destination)
        except requests.RequestException as exc:
            last = exc
            if attempt + 1 < attempts:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Unable to retrieve {url}: {last}") from last
