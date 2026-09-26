"""Export internal city records as an immutable, canonical ranking.v2 release."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any

from contracts.models import CityFeature, DataRelease, FeatureSpec, RankingRequest
from odd_ranking.engine import rank
from odd_ranking.normalization import freeze_bounds, load_feature_registry

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CITIES = ROOT / "data" / "data" / "processed" / "cities" / "all_city_features.json"
DEFAULT_REFERENCES = ROOT / "data" / "data" / "processed" / "reference_markets" / "reference_markets.json"
DEFAULT_REFERENCE_PROVENANCE = ROOT / "data" / "data" / "processed" / "reference_markets" / "reference_markets_provenance.json"
DEFAULT_CONFIG = ROOT / "config" / "ranking.v2.json"
DEFAULT_OUTPUT = ROOT / "data" / "releases" / "verified.v2.json"
CODE = re.compile(r"^\d{5}$")
CITY_ID = re.compile(r"^cbsa:\d{5}$")
OPTIONAL_UNITS = {
    "average_aadt": "vehicles/day",
    "lane_miles_per_km2": "lane-miles/km2",
}


def canonical_city_id(value: str) -> str:
    """Convert one internal code to the API form without double-prefixing."""
    if CITY_ID.fullmatch(value):
        return value
    if CODE.fullmatch(value):
        return f"cbsa:{value}"
    raise ValueError(f"Invalid internal CBSA code: {value!r}")


def build_release(
    city_records: list[dict[str, Any]],
    reference_records: list[dict[str, Any]],
    reference_provenance: dict[str, Any] | None,
    config: dict[str, Any],
    *,
    allow_invalid_source_measurements: bool = False,
) -> DataRelease:
    """Build a release copy; invalid source values are audit-only, never publishable."""
    if config.get("model_version") != "ranking.v2":
        raise ValueError("The exporter requires a ranking.v2 configuration")
    configured_features = tuple(
        FeatureSpec.model_validate(row) for row in config.get("features", [])
    )

    def feature_contract(rows):
        return tuple(
            (row.key, row.pillar, row.unit, row.transform, row.weight, row.maximum)
            for row in rows
        )

    if feature_contract(configured_features) != feature_contract(
        load_feature_registry()
    ):
        raise ValueError("The supplied config does not match the ranking.v2 feature registry")
    if not city_records:
        raise ValueError("No processed city records were supplied")

    cities = json.loads(json.dumps(city_records))
    city_by_id: dict[str, dict[str, Any]] = {}
    invalid_measurements: list[str] = []
    for city in cities:
        raw_id = city["city_id"]
        city_id = canonical_city_id(raw_id)
        if raw_id.startswith("cbsa:") and not CITY_ID.fullmatch(raw_id):
            raise ValueError(f"Malformed canonical CBSA ID: {raw_id!r}")
        if city_id in city_by_id:
            raise ValueError(f"Duplicate city ID: {city_id}")
        city["city_id"] = city_id
        city["versions"]["model_version"] = "ranking.v2"
        city["features"] = {
            key: dict(measurement)
            for key, measurement in city["features"].items()
        }
        for key, measurement in city["features"].items():
            if measurement.get("value") is not None and (
                measurement.get("quality") == "missing"
                or measurement.get("missing_reason")
                or not measurement.get("provenance_ids")
            ):
                invalid_measurements.append(
                    f"{city_id} {key} has a numeric value but fails source completeness "
                    f"validation (quality={measurement.get('quality')!r}, "
                    f"missing_reason={measurement.get('missing_reason')!r}, "
                    f"provenance_ids={measurement.get('provenance_ids', [])!r})"
                )
                if allow_invalid_source_measurements:
                    measurement["value"] = None
                    measurement["quality"] = "missing"
                    measurement["missing_reason"] = (
                        measurement.get("missing_reason")
                        or "Source record failed measurement completeness validation."
                    )
                    measurement["provenance_ids"] = []
        for key, unit in OPTIONAL_UNITS.items():
            city["features"].setdefault(
                key,
                {
                    "value": None,
                    "unit": unit,
                    "quality": "missing",
                    "missing_reason": "This optional informational road measurement is unavailable.",
                    "provenance_ids": [],
                },
            )
        city_by_id[city_id] = city

    if invalid_measurements and not allow_invalid_source_measurements:
        raise ValueError(
            "Refusing to rewrite invalid source measurements: "
            + "; ".join(invalid_measurements)
        )

    references = json.loads(json.dumps(reference_records))
    reference_ids: set[str] = set()
    for ref in references:
        raw_id = ref["city_id"]
        ref["city_id"] = canonical_city_id(raw_id)
        if ref["city_id"] not in city_by_id:
            raise ValueError(f"Reference city is not in the release: {ref['city_id']}")
        reference_ids.add(ref["city_id"])

    if reference_provenance:
        for city_id in reference_ids:
            city = city_by_id[city_id]
            provenance_ids = {item["id"] for item in city["provenance"]}
            if reference_provenance["id"] not in provenance_ids:
                city["provenance"].append(reference_provenance)

    features = config["features"]
    scoring_keys = [feature["key"] for feature in features]
    for city_id, city in city_by_id.items():
        for key in scoring_keys:
            if key not in city["features"]:
                raise ValueError(f"{city_id} is missing registered measurement {key}")

    configured_codes = config.get("candidate_cbsa_codes")
    if not isinstance(configured_codes, list) or not configured_codes:
        raise ValueError("ranking.v2 config must declare candidate_cbsa_codes")
    candidates = sorted(canonical_city_id(code) for code in configured_codes)
    if len(set(candidates)) != len(candidates):
        raise ValueError("ranking.v2 config contains duplicate candidate CBSA codes")
    if set(candidates) & reference_ids:
        raise ValueError("Configured candidate and reference cities overlap")
    unknown_candidates = set(candidates) - set(city_by_id)
    if unknown_candidates:
        raise ValueError(f"Configured candidates are missing from processed data: {sorted(unknown_candidates)}")
    unknown_references = reference_ids - set(city_by_id)
    if unknown_references:
        raise ValueError(f"Reference cities are missing from processed data: {sorted(unknown_references)}")
    city_by_id = {
        city_id: city
        for city_id, city in city_by_id.items()
        if city_id in set(candidates) | reference_ids
    }

    for reference in references:
        city = city_by_id[reference["city_id"]]
        complete = all(
            city["features"][key]["value"] is not None
            for key in scoring_keys
        )
        if reference["enabled"] and not complete:
            reference["enabled"] = False
    complete_candidate_ids = [
        city_id
        for city_id in candidates
        if all(
            city_by_id[city_id]["features"][key]["value"] is not None
            for key in scoring_keys
        )
    ]
    if not complete_candidate_ids:
        raise ValueError("No complete cities are available to freeze normalization bounds")
    cohort_ids = sorted(
        set(complete_candidate_ids)
        | {ref["city_id"] for ref in references if ref["enabled"]}
    )
    canonical_cities = {
        city_id: CityFeature.model_validate(city)
        for city_id, city in city_by_id.items()
    }
    feature_specs = [FeatureSpec.model_validate(feature) for feature in features]
    bounds = {
        key: value.model_dump(mode="json")
        for key, value in freeze_bounds(canonical_cities, feature_specs, cohort_ids).items()
    }
    constant_features = sorted(
        key for key, value in bounds.items() if value["lower"] == value["upper"]
    )

    versions = dict(city_records[0]["versions"])
    versions["model_version"] = "ranking.v2"
    payload = {
        "versions": versions,
        "candidate_ids": candidates,
        "cities": list(city_by_id.values()),
        "references": references,
        "features": features,
        "bounds": bounds,
        "normalization_cohort": cohort_ids,
        "exclusions": [
            f"{city_id}: incomplete ranking.v2 measurements"
            for city_id in sorted(set(candidates) - set(complete_candidate_ids))
        ]
        + [
            f"{ref['id']}: disabled because {ref['city_id']} has incomplete ranking.v2 measurements"
            for ref in references
            if not ref["enabled"]
        ]
        + invalid_measurements,
    }
    payload["exclusions"].extend(
        f"{key}: constant in the complete ranking.v2 cohort; removed globally from scoring"
        for key in constant_features
    )
    return DataRelease.model_validate(payload)


def validate_rankable(release: DataRelease, minimum_candidates: int = 8) -> None:
    """Require compatible references and enough complete candidates before publish."""
    result = rank(release, RankingRequest())
    if len(result.ranked) < minimum_candidates:
        raise ValueError(
            f"Release has {len(result.ranked)} ranked candidates; "
            f"at least {minimum_candidates} are required"
        )


def write_immutable(release: DataRelease, output: Path) -> None:
    """Create the release once; permit an identical repeat as a no-op."""
    output.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(release.model_dump(mode="json"), indent=2, sort_keys=True) + "\n"
    try:
        with output.open("x", encoding="utf-8", newline="\n") as stream:
            stream.write(content)
    except FileExistsError:
        if output.read_text(encoding="utf-8") != content:
            raise FileExistsError(f"Refusing to overwrite immutable release: {output}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cities", type=Path, default=DEFAULT_CITIES)
    parser.add_argument("--references", type=Path, default=DEFAULT_REFERENCES)
    parser.add_argument("--reference-provenance", type=Path, default=DEFAULT_REFERENCE_PROVENANCE)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    release = build_release(
        json.loads(args.cities.read_text(encoding="utf-8")),
        json.loads(args.references.read_text(encoding="utf-8")),
        json.loads(args.reference_provenance.read_text(encoding="utf-8"))
        if args.reference_provenance.exists()
        else None,
        json.loads(args.config.read_text(encoding="utf-8")),
    )
    validate_rankable(release)
    write_immutable(release, args.output)
    sha = hashlib.sha256(args.output.read_bytes()).hexdigest()
    print(f"Validated and wrote {args.output} ({len(release.cities)} cities, sha256={sha})")


if __name__ == "__main__":
    main()
