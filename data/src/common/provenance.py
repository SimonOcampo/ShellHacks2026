"""Create provenance objects from saved raw source artifacts."""
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid5, NAMESPACE_URL
from src.contracts.models import Provenance
from .hashing import sha256_file

def provenance(*, source_name: str, source_url: str, dataset_id: str, period: str, raw_path: Path, source_geography: str, target_geography: str, transformation: str, assumptions: list[str]) -> Provenance:
    digest = sha256_file(raw_path)
    # A single raw artifact can support distinct transformations (for example,
    # annual climate normals and a threshold-specific hot-day metric). Keep
    # those provenance records distinct while remaining deterministic.
    stable = f"{dataset_id}|{period}|{digest}|{target_geography}|{source_geography}|{transformation}"
    return Provenance(id=str(uuid5(NAMESPACE_URL, stable)), source_name=source_name, source_url=source_url, dataset_id=dataset_id, period=period, retrieved_at=datetime.fromtimestamp(raw_path.stat().st_mtime, timezone.utc).isoformat(), source_geography=source_geography, target_geography=target_geography, transformation=transformation, assumptions=assumptions, raw_sha256=digest)
