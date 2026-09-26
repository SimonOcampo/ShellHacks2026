"""Contract validation and deterministic serialization helpers."""
from pathlib import Path
import json
from src.contracts.models import CityFeature

def write_city(model: CityFeature, path: Path) -> None:
    validated = CityFeature.model_validate(model.model_dump(mode="json"))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(validated.model_dump(mode="json"), indent=2, sort_keys=True), encoding="utf-8")
