import pytest

from odd_scout.store import load_release
from src.pipeline.verify_release_sources import build_report
from src.pipeline.verify_release_sources import RELEASE


def test_verified_release_reconciles_with_preserved_sources():
    report = build_report()
    assert report["ranked_candidates"] == 20
    assert report["enabled_references"] == 15
    assert report["release_provenance"]["provenance_records_resolved"] == 875
    assert report["frozen_bounds"] == {"scoring_features_checked": 15,
                                       "complete_cohort_cities_checked": 35}
    assert report["noaa"]["used_observations_verified"] == 175
    assert report["noaa_station_selection"]["city_feature_selections_checked"] == 105
    assert report["noaa_station_selection"]["closer_nonreporting_snowfall_stations_checked"] == 10
    assert report["afdc"]["joined_sites_verified"] == 4182
    assert report["afdc"]["all_qualifying_sites_in_configured_cbsas_accounted_for"]
    assert report["afdc"]["county_population_coverage_verified"]


def test_verified_runtime_loads_matching_release_and_rejects_mode_mismatch(monkeypatch):
    monkeypatch.setenv("ODD_DATA_RELEASE", str(RELEASE))
    monkeypatch.setenv("ODD_DATA_MODE", "verified")
    assert load_release().versions.model_version == "ranking.v2"
    monkeypatch.setenv("ODD_DATA_MODE", "mock")
    with pytest.raises(ValueError, match="must match release"):
        load_release()
