"""Build an auditable ranking.v2 normalization snapshot from processed records."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from contracts.models import DataRelease, RankingRequest
from odd_ranking.engine import rank
from odd_ranking.normalization import missing_active_features, normalize_value, transform_value
from src.pipeline.export_release import (
    build_release as build_canonical_release,
    canonical_city_id,
)


ROOT = Path(__file__).resolve().parents[3]
PROCESSED = ROOT / "data" / "data" / "processed"
DEFAULT_CITIES = PROCESSED / "cities" / "all_city_features.json"
DEFAULT_REFERENCES = PROCESSED / "reference_markets" / "reference_markets.json"
DEFAULT_OUTPUT = ROOT / "data" / "audits" / "ranking.v2-normalization.json"
FAMILIARITY_ORDER = (
    "annual_precipitation_mm",
    "annual_snowfall_mm",
    "hot_days_32c",
    "mean_commute_minutes",
    "road_density_km_per_km2",
    "intersection_density_per_km2",
    "freeway_share",
    "arterial_share",
    "local_road_share",
)
READINESS_ORDER = (
    "public_dc_ports_per_100k",
    "population_share_in_counties_with_dc",
)
OPPORTUNITY_ORDER = (
    "population",
    "population_density_per_km2",
    "zero_vehicle_household_share",
    "transit_commute_share",
)
OPTIONAL_KEYS = ("average_aadt", "lane_miles_per_km2")


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _city_trace(
    city: CityFeature,
    release: DataRelease,
    source_record: dict[str, Any] | None = None,
) -> dict[str, Any]:
    specs = {feature.key: feature for feature in release.features}
    rows: dict[str, Any] = {}
    for key, spec in specs.items():
        measurement = city.features.get(key)
        source_measurement = (
            source_record.get("features", {}).get(key, {}) if source_record else {}
        )
        raw_value = source_measurement.get(
            "value", measurement.value if measurement else None
        )
        valid_value = measurement.value if measurement else None
        transformed_value = (
            transform_value(valid_value, spec.transform) if valid_value is not None else None
        )
        normalized = (
            normalize_value(valid_value, spec, release.bounds[key])
            if valid_value is not None
            else None
        )
        rows[key] = {
            "raw_value": raw_value,
            "transform": spec.transform,
            "transformed_value": transformed_value,
            "lower_bound": release.bounds[key].lower,
            "upper_bound": release.bounds[key].upper,
            "normalized_value": normalized,
            "missing_reason": measurement.missing_reason if measurement else "Measurement absent.",
            "source_quality": source_measurement.get("quality"),
            "source_missing_reason": source_measurement.get("missing_reason"),
            "provenance_ids": list(measurement.provenance_ids) if measurement else [],
        }
    return rows


def build_audit(
    release: DataRelease, source_records: dict[str, dict[str, Any]] | None = None
) -> dict[str, Any]:
    """Create a deterministic audit report, not a production release file."""
    specs = {feature.key: feature for feature in release.features}
    universe_ids = sorted(
        set(release.candidate_ids) | {ref.city_id for ref in release.references}
    )
    city_by_id = {city.city_id: city for city in release.cities}
    complete_ids = [
        city_id
        for city_id in universe_ids
        if not missing_active_features(city_by_id[city_id], release.features)
    ]

    feature_report = []
    for spec in release.features:
        observed = [
            city_by_id[city_id].features[spec.key].value
            for city_id in universe_ids
            if city_by_id[city_id].features[spec.key].value is not None
        ]
        complete_cohort_raw = [
            city_by_id[city_id].features[spec.key].value
            for city_id in release.normalization_cohort
        ]
        complete_cohort_transformed = [
            transform_value(value, spec.transform) for value in complete_cohort_raw
        ]
        bound = release.bounds[spec.key]
        feature_report.append(
            {
                "feature": spec.key,
                "transform": spec.transform,
                "raw_minimum": min(complete_cohort_raw),
                "raw_maximum": max(complete_cohort_raw),
                "transformed_minimum": min(complete_cohort_transformed),
                "transformed_maximum": max(complete_cohort_transformed),
                "lower_bound": bound.lower,
                "upper_bound": bound.upper,
                "complete_observation_count": len(observed),
                "missing_observation_count": len(universe_ids) - len(observed),
                "normalization_cohort_observation_count": len(complete_cohort_raw),
                "constant": bound.lower == bound.upper,
            }
        )

    missing_report = []
    for city_id in universe_ids:
        city = city_by_id[city_id]
        missing = missing_active_features(city, release.features)
        for key in missing:
            measurement = city.features.get(key)
            missing_report.append(
                {
                    "city_id": city_id,
                    "display_name": city.display_name,
                    "feature": key,
                    "missing_reason": measurement.missing_reason if measurement else "Measurement absent.",
                    "measurement_provenance_ids": list(measurement.provenance_ids) if measurement else [],
                    "city_provenance": [
                        {"id": p.id, "source_name": p.source_name, "source_url": p.source_url, "dataset_id": p.dataset_id}
                        for p in city.provenance
                    ],
                }
            )

    optional_missing = {
        key: [
            city_id
            for city_id in universe_ids
            if city_by_id[city_id].features.get(key) is None
            or city_by_id[city_id].features[key].value is None
        ]
        for key in OPTIONAL_KEYS
    }
    audit_rows = []
    for city_id in universe_ids:
        city = city_by_id[city_id]
        role = "candidate" if city_id in release.candidate_ids else "reference"
        eligible = city_id in release.normalization_cohort
        for spec in release.features:
            measurement = city.features.get(spec.key)
            raw_value = measurement.value if measurement else None
            transformed = (
                transform_value(raw_value, spec.transform) if raw_value is not None else None
            )
            normalized = (
                normalize_value(raw_value, spec, release.bounds[spec.key])
                if raw_value is not None
                else None
            )
            audit_rows.append(
                {
                    "city_id": city_id,
                    "role": role,
                    "normalization_eligible": eligible,
                    "feature": spec.key,
                    "raw_value": source_records.get(city_id, {}).get("features", {}).get(spec.key, {}).get("value", raw_value) if source_records else raw_value,
                    "transform": spec.transform,
                    "transformed_value": transformed,
                    "lower_bound": release.bounds[spec.key].lower,
                    "upper_bound": release.bounds[spec.key].upper,
                    "normalized_value": normalized,
                    "missing_reason": measurement.missing_reason if measurement else "Measurement absent.",
                    "source_quality": source_records.get(city_id, {}).get("features", {}).get(spec.key, {}).get("quality") if source_records else None,
                    "source_missing_reason": source_records.get(city_id, {}).get("features", {}).get(spec.key, {}).get("missing_reason") if source_records else None,
                    "validation_status": "available" if raw_value is not None else "missing_or_invalid",
                    "provenance_ids": list(measurement.provenance_ids) if measurement else [],
                }
            )

    if not any(city_id in complete_ids for city_id in release.candidate_ids):
        raise ValueError("No complete ranking.v2 candidate is available for the manual trace")
    if not any(ref.enabled for ref in release.references):
        raise ValueError("No complete enabled ranking.v2 reference is available for the manual trace")
    candidate_id = next(city_id for city_id in release.candidate_ids if city_id in complete_ids)
    ranking = rank(release, RankingRequest())
    candidate_score = next(
        (item for item in ranking.ranked if item.city_id == candidate_id), None
    )
    if candidate_score is None or not candidate_score.reference_matches:
        raise ValueError("The trace candidate was not accepted by the ranking engine")
    nearest_match = candidate_score.reference_matches[0]
    reference_id = next(
        ref.city_id for ref in release.references if ref.id == nearest_match.reference_id
    )
    candidate_trace = _city_trace(
        city_by_id[candidate_id], release, source_records.get(candidate_id) if source_records else None
    )
    reference_trace = _city_trace(
        city_by_id[reference_id], release, source_records.get(reference_id) if source_records else None
    )
    trace = {
        "candidate_city_id": candidate_id,
        "candidate_display_name": city_by_id[candidate_id].display_name,
        "reference_city_id": reference_id,
        "reference_display_name": city_by_id[reference_id].display_name,
        "candidate": candidate_trace,
        "reference": reference_trace,
        "vectors": {
            "candidate": {
                "familiarity_9d": [candidate_trace[key]["normalized_value"] for key in FAMILIARITY_ORDER],
                "readiness_2d": [candidate_trace[key]["normalized_value"] for key in READINESS_ORDER],
                "opportunity_4d": [candidate_trace[key]["normalized_value"] for key in OPPORTUNITY_ORDER],
            },
            "reference": {
                "familiarity_9d": [reference_trace[key]["normalized_value"] for key in FAMILIARITY_ORDER],
                "readiness_2d": [reference_trace[key]["normalized_value"] for key in READINESS_ORDER],
                "opportunity_4d": [reference_trace[key]["normalized_value"] for key in OPPORTUNITY_ORDER],
            },
        },
        "ranking_engine_accepted_candidate": candidate_score is not None,
        "candidate_rank": candidate_score.rank if candidate_score else None,
        "candidate_expansion_score": candidate_score.expansion_score if candidate_score else None,
        "nearest_whole_reference": nearest_match.reference_id,
        "nearest_reference_distance": nearest_match.distance,
        "nearest_reference_similarity": nearest_match.similarity,
    }
    return {
        "artifact_type": "ranking.v2 normalization audit; not a production release",
        "versions": release.versions.model_dump(mode="json"),
        "feature_registry": [spec.model_dump(mode="json") for spec in release.features],
        "normalization_cohort": release.normalization_cohort,
        "cohort_policy": "Complete configured candidate cities plus enabled, complete references; sorted canonical CBSA IDs.",
        "feature_bounds": feature_report,
        "disabled_incomplete_references": [
            {"reference_id": ref.id, "city_id": ref.city_id, "missing_features": missing_active_features(city_by_id[ref.city_id], release.features)}
            for ref in release.references
            if not ref.enabled
        ],
        "missing_active_measurements": missing_report,
        "invalid_source_measurements": [
            {
                "city_id": canonical_city_id(raw_city_id.removeprefix("cbsa:")),
                "display_name": source_records[raw_city_id]["display_name"],
                "feature": key,
                "raw_value": measurement.get("value"),
                "quality": measurement.get("quality"),
                "missing_reason": measurement.get("missing_reason"),
                "provenance_ids": measurement.get("provenance_ids", []),
                "city_provenance": [
                    {"id": p["id"], "source_name": p["source_name"], "source_url": p["source_url"], "dataset_id": p["dataset_id"]}
                    for p in source_records[raw_city_id].get("provenance", [])
                ],
            }
            for raw_city_id in (source_records or {})
            for key, measurement in source_records[raw_city_id].get("features", {}).items()
            if key in specs
            and measurement.get("value") is not None
            and (
                measurement.get("quality") == "missing"
                or measurement.get("missing_reason")
                or not measurement.get("provenance_ids")
            )
        ],
        "optional_unscored_missing_city_ids": optional_missing,
        "complete_candidate_count": sum(
            city_id in complete_ids for city_id in release.candidate_ids
        ),
        "required_complete_candidate_count": 8,
        "release_ready_for_verified_api": sum(
            city_id in complete_ids for city_id in release.candidate_ids
        ) >= 8,
        "ranking_result": {
            "ranked_candidate_ids": [item.city_id for item in ranking.ranked],
            "unranked": [
                {"city_id": item.city_id, "reasons": item.exclusion_reasons}
                for item in ranking.unranked
            ],
        },
        "manual_trace": trace,
        "audit_rows": audit_rows,
        "exclusions": release.exclusions,
    }


def create_audit(cities_path: Path, references_path: Path) -> dict[str, Any]:
    """Build twice and require identical release/config output before reporting."""
    city_rows = _read_json(cities_path)
    reference_rows = _read_json(references_path)
    reference_provenance_path = (
        PROCESSED / "reference_markets" / "reference_markets_provenance.json"
    )
    reference_provenance = (
        _read_json(reference_provenance_path)
        if reference_provenance_path.exists()
        else None
    )
    config = _read_json(ROOT / "config" / "ranking.v2.json")
    first = build_canonical_release(
        city_rows,
        reference_rows,
        reference_provenance,
        config,
        allow_invalid_source_measurements=True,
    )
    second = build_canonical_release(
        city_rows,
        reference_rows,
        reference_provenance,
        config,
        allow_invalid_source_measurements=True,
    )
    source_records = {
        canonical_city_id(str(row["city_id"])): row for row in city_rows
    }
    first_json = first.model_dump(mode="json")
    second_json = second.model_dump(mode="json")
    if first_json != second_json:
        raise ValueError("Identical inputs produced different release normalization data")
    audit = build_audit(first, source_records)
    audit["determinism"] = {
        "identical_input_release_equal": True,
        "bounds_equal": first.bounds == second.bounds,
        "cohort_equal": first.normalization_cohort == second.normalization_cohort,
        "normalized_values_equal": build_audit(first, source_records)["audit_rows"]
        == build_audit(second, source_records)["audit_rows"],
    }
    return audit


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cities", type=Path, default=DEFAULT_CITIES)
    parser.add_argument("--references", type=Path, default=DEFAULT_REFERENCES)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = create_audit(args.cities, args.references)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    print(
        f"Wrote {args.output}; cohort={len(report['normalization_cohort'])}, "
        f"ranked={len(report['ranking_result']['ranked_candidate_ids'])}, "
        f"verified_api_ready={report['release_ready_for_verified_api']}"
    )


if __name__ == "__main__":
    main()
