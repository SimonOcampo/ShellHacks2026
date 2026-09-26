import json
from pathlib import Path

from contracts.models import DataRelease, RankingRequest
from odd_ranking.engine import rank
from src.pipeline.export_release import build_release, canonical_city_id


def _measurement(value, unit, *, missing=False):
    return {
        "value": None if missing else value,
        "unit": unit,
        "quality": "missing" if missing else "derived",
        "missing_reason": "Unavailable in export integration fixture." if missing else None,
        "provenance_ids": [] if missing else ["source"],
    }


def _city(code, index, specs):
    features = {}
    for spec in specs:
        key = spec["key"]
        if key in {"freeway_share", "arterial_share", "local_road_share"}:
            value = {"freeway_share": 0.2, "arterial_share": 0.3, "local_road_share": 0.5}[key]
        elif key in {"population_share_in_counties_with_dc", "zero_vehicle_household_share", "transit_commute_share"}:
            value = 0.2 + index * 0.1
        else:
            value = float(index + 1) * 10
        features[key] = _measurement(value, spec["unit"])
    features["average_aadt"] = _measurement(None, "vehicles/day", missing=True)
    features["lane_miles_per_km2"] = _measurement(None, "lane-miles/km2", missing=True)
    return {
        "versions": {"schema_version": "1", "data_version": "fixture", "model_version": "city-feature-v1", "data_mode": "mock"},
        "city_id": code,
        "display_name": f"Test {code}",
        "official_name": f"Test CBSA {code}",
        "geography_type": "cbsa",
        "geography_vintage": "2024",
        "state_codes": ["ZZ"],
        "latitude": 0,
        "longitude": 0,
        "features": features,
        "legal_evidence": [],
        "provenance": [{
            "id": "source", "source_name": "Fixture source", "source_url": "https://example.org/data",
            "dataset_id": "fixture", "period": "2024", "retrieved_at": "2026-09-26T00:00:00Z",
            "source_geography": "CBSA", "target_geography": "CBSA", "transformation": "Test fixture",
            "assumptions": [], "raw_sha256": "a" * 64,
        }],
    }


def test_pipeline_export_validates_canonical_release_and_prefixes_ids():
    config = json.loads((Path(__file__).parents[2] / "config" / "ranking.v2.json").read_text(encoding="utf-8"))
    cities = [_city("10001", 0, config["features"]), _city("10003", 1, config["features"]), _city("10005", 2, config["features"])]
    config["candidate_cbsa_codes"] = ["10003", "10005"]
    references = [{
        "id": "reference-10001", "city_id": "10001", "operator": "Example",
        "category": "commercial", "status_as_of": "2026-09-26", "enabled": True,
        "provenance_ids": ["reference-source"],
    }]
    reference_provenance = {
        "id": "reference-source", "source_name": "Reference fixture", "source_url": "https://example.org/reference",
        "dataset_id": "reference-fixture", "period": "2026", "retrieved_at": "2026-09-26T00:00:00Z",
        "source_geography": "market list", "target_geography": "CBSA", "transformation": "Test fixture",
        "assumptions": [], "raw_sha256": "b" * 64,
    }

    exported = build_release(cities, references, reference_provenance, config)
    canonical = DataRelease.model_validate_json(exported.model_dump_json())
    result = rank(canonical, RankingRequest())
    assert result == rank(canonical, RankingRequest())

    assert canonical.versions.model_version == "ranking.v2"
    assert canonical.candidate_ids == ["cbsa:10003", "cbsa:10005"]
    assert canonical.references[0].city_id == "cbsa:10001"
    assert result.ranked
    assert canonical.cities[0].features["average_aadt"].value is None
    assert canonical.cities[0].features["lane_miles_per_km2"].missing_reason


def test_canonical_city_id_rejects_bare_and_double_prefixed_ids():
    assert canonical_city_id("12345") == "cbsa:12345"
    assert canonical_city_id("cbsa:12345") == "cbsa:12345"
    for invalid in ("cbsa:cbsa:12345", "1234", "abcde"):
        try:
            canonical_city_id(invalid)
        except ValueError:
            pass
        else:
            raise AssertionError(f"Accepted malformed CBSA ID: {invalid}")


def test_invalid_source_measurement_is_rejected_without_rewriting_input():
    config = json.loads((Path(__file__).parents[2] / "config" / "ranking.v2.json").read_text(encoding="utf-8"))
    cities = [_city("10001", 0, config["features"]), _city("10003", 1, config["features"])]
    config["candidate_cbsa_codes"] = ["10003"]
    invalid = cities[0]["features"]["mean_commute_minutes"]
    invalid.update(value=24.0, quality="missing", missing_reason="Source is marked missing.", provenance_ids=[])
    original = json.loads(json.dumps(cities))
    references = [{
        "id": "reference-10001", "city_id": "10001", "operator": "Example",
        "category": "commercial", "status_as_of": "2026-09-26", "enabled": True,
        "provenance_ids": ["reference-source"],
    }]
    reference_provenance = {
        "id": "reference-source", "source_name": "Reference fixture", "source_url": "https://example.org/reference",
        "dataset_id": "reference-fixture", "period": "2026", "retrieved_at": "2026-09-26T00:00:00Z",
        "source_geography": "market list", "target_geography": "CBSA", "transformation": "Test fixture",
        "assumptions": [], "raw_sha256": "b" * 64,
    }

    try:
        build_release(cities, references, reference_provenance, config)
    except ValueError as exc:
        assert "Refusing to rewrite invalid source measurements" in str(exc)
    else:
        raise AssertionError("Invalid source measurement should stop release export")
    assert cities == original

    preview = build_release(
        cities,
        references,
        reference_provenance,
        config,
        allow_invalid_source_measurements=True,
    )
    invalid_preview = next(
        city for city in preview.cities if city.city_id == "cbsa:10001"
    )
    assert invalid_preview.features["mean_commute_minutes"].value is None
    assert cities[0]["features"]["mean_commute_minutes"]["value"] == 24.0
    assert not preview.references[0].enabled
