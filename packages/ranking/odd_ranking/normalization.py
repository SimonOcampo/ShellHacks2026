"""Deterministic ranking.v2 transforms and frozen min-max normalization."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Iterable

from contracts.models import Bounds, CityFeature, FeatureSpec


class NormalizationError(ValueError):
    """Raised when a ranking value cannot be normalized under its feature contract."""


SUPPORTED_TRANSFORMS = frozenset({"linear", "log1p"})
RANKING_V2_CONFIG = Path(__file__).resolve().parents[3] / "config" / "ranking.v2.json"


def load_feature_registry(path: Path = RANKING_V2_CONFIG) -> tuple[FeatureSpec, ...]:
    """Load and validate the single ranking.v2 feature registry."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    features = tuple(FeatureSpec.model_validate(item) for item in payload["features"])
    keys = [feature.key for feature in features]
    if len(keys) != 15 or len(set(keys)) != 15:
        raise NormalizationError("ranking.v2 registry must contain 15 unique features")
    if any(feature.transform not in SUPPORTED_TRANSFORMS for feature in features):
        raise NormalizationError("ranking.v2 registry has an unsupported transform")
    for pillar in ("familiarity", "readiness", "opportunity"):
        pillar_features = [f for f in features if f.pillar == pillar]
        if not pillar_features:
            raise NormalizationError(f"ranking.v2 has no {pillar} features")
        if not math.isclose(sum(f.weight for f in pillar_features), 1.0, abs_tol=1e-12):
            raise NormalizationError(f"{pillar} feature weights must sum to 1")
    return features


def transform_value(value: float, transform_name: str) -> float:
    """Apply one declared transform without changing or repairing source values."""
    if transform_name not in SUPPORTED_TRANSFORMS:
        raise NormalizationError(f"Unknown transform: {transform_name}")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise NormalizationError("Ranking measurements must be numeric")
    value = float(value)
    if not math.isfinite(value):
        raise NormalizationError("Ranking measurements must be finite")
    if transform_name == "log1p":
        if value < 0:
            raise NormalizationError("log1p input must be nonnegative")
        result = math.log1p(value)
    else:
        result = value
    if not math.isfinite(result):
        raise NormalizationError("Transformed ranking measurements must be finite")
    return result


def missing_active_features(city: CityFeature, features: Iterable[FeatureSpec]) -> list[str]:
    """Return missing active measurements in the registry's stable order."""
    return [
        spec.key
        for spec in features
        if spec.key not in city.features or city.features[spec.key].value is None
    ]


def freeze_bounds(
    cities: dict[str, CityFeature],
    features: Iterable[FeatureSpec],
    cohort_ids: Iterable[str],
) -> dict[str, Bounds]:
    """Calculate transformed min/max bounds from one frozen complete cohort."""
    features = tuple(features)
    cohort = tuple(cohort_ids)
    if tuple(sorted(set(cohort))) != cohort:
        raise NormalizationError("Normalization cohort must be unique and sorted")
    if not cohort:
        raise NormalizationError("Normalization cohort cannot be empty")
    if any(city_id not in cities for city_id in cohort):
        raise NormalizationError("Normalization cohort contains an unknown city")
    result: dict[str, Bounds] = {}
    for spec in features:
        transformed: list[float] = []
        for city_id in cohort:
            measurement = cities[city_id].features.get(spec.key)
            if measurement is None or measurement.value is None:
                raise NormalizationError(
                    f"Incomplete normalization cohort: {city_id} lacks {spec.key}"
                )
            transformed.append(transform_value(measurement.value, spec.transform))
        lower, upper = min(transformed), max(transformed)
        result[spec.key] = Bounds(lower=lower, upper=upper)
    return result


def normalize_value(value: float, spec: FeatureSpec, bounds: Bounds) -> float | None:
    """Transform and clip a value using frozen transformed-space bounds.

    A constant feature returns None because it is removed globally from scoring.
    """
    if bounds.lower == bounds.upper:
        return None
    if bounds.lower > bounds.upper:
        raise NormalizationError(f"Invalid bounds for {spec.key}")
    transformed = transform_value(value, spec.transform)
    normalized = (transformed - bounds.lower) / (bounds.upper - bounds.lower)
    if not math.isfinite(normalized):
        raise NormalizationError(f"Non-finite normalized value for {spec.key}")
    clipped = min(1.0, max(0.0, normalized))
    if not 0.0 <= clipped <= 1.0:
        raise NormalizationError(f"Normalized value outside [0,1] for {spec.key}")
    return clipped
