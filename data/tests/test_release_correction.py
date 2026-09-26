"""Regression proof for the bounded source correction; synthetic values stay mock."""

import json
from pathlib import Path

import pytest
from contracts.models import DataRelease
from src.pipeline.correct_release import DATA_SUFFIX, correct_release

ROOT = Path(__file__).resolve().parents[2]


def test_correction_preserves_unrelated_measurements_and_parent(tmp_path):
    parent = DataRelease.model_validate_json(
        (ROOT / "data/releases/mock.v1.json").read_bytes()
    )
    parent = parent.model_copy(
        update={"normalization_cohort": sorted(parent.normalization_cohort)}
    )
    original = parent.model_dump(mode="json")
    paths = {}
    for table, estimate, moe in (("b08013", 12000, 400), ("b08303", 400, 20)):
        path = tmp_path / f"{table}.dat"
        rows = [f"GEO_ID|{table.upper()}_E001|{table.upper()}_M001"]
        rows += [
            f"310M700US{city.city_id.removeprefix('cbsa:')}|{estimate}|{moe}"
            for city in parent.cities
        ]
        path.write_text("\n".join(rows) + "\n")
        paths[table] = path
    corrected, observations = correct_release(parent, paths)
    assert parent.model_dump(mode="json") == original
    assert corrected.versions.data_mode == "mock"
    assert corrected.versions.data_version.endswith(DATA_SUFFIX)
    assert corrected.references == parent.references
    assert corrected.candidate_ids == parent.candidate_ids
    for old, new in zip(parent.cities, corrected.cities):
        assert new.features["mean_commute_minutes"].value == 30
        assert len(new.features["mean_commute_minutes"].provenance_ids) == 2
        assert new.features["mean_commute_minutes"].quality == "derived"
        assert {
            k: v for k, v in new.features.items() if k != "mean_commute_minutes"
        } == {k: v for k, v in old.features.items() if k != "mean_commute_minutes"}
    assert len(observations) == len(parent.cities)


def test_parent_audit_hash_mismatch_blocks_publication(monkeypatch, tmp_path):
    import src.pipeline.correct_release as module

    audit = tmp_path / "audit.json"
    audit.write_text(json.dumps({"release_sha256": "0" * 64}))
    monkeypatch.setattr(module, "PARENT_AUDIT", audit)
    with pytest.raises(ValueError, match="does not match"):
        module.prepare({})
