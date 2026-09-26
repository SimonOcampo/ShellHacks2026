import pytest
import json
from pathlib import Path
from pydantic import ValidationError

from contracts.models import CityFeature, DataRelease, FeatureSpec, RankingRequest
from odd_ranking.engine import rank


ROAD_MEASUREMENTS = {
    "road_density_km_per_km2": ("km/km2", 0.5),
    "intersection_density_per_km2": ("intersections/km2", 0.5),
    "freeway_share": ("fraction", 0.3),
    "arterial_share": ("fraction", 0.3),
    "local_road_share": ("fraction", 0.4),
    "average_aadt": ("vehicles/day", 10000),
    "lane_miles_per_km2": ("lane-miles/km2", 1.0),
}
UNSCORED = {"average_aadt", "lane_miles_per_km2"}


def expanded_mock(release):
    payload = release.model_dump()
    payload["versions"]["model_version"] = "ranking.v2"
    payload["normalization_cohort"] = sorted(payload["normalization_cohort"])
    for city in payload["cities"]:
        city["versions"]["model_version"] = "ranking.v2"
        provenance_id = city["provenance"][0]["id"]
        for key, (unit, value) in ROAD_MEASUREMENTS.items():
            city["features"][key] = {
                "value": value,
                "unit": unit,
                "quality": "proxy",
                "missing_reason": None,
                "provenance_ids": [provenance_id],
            }
    for key, (unit, _) in ROAD_MEASUREMENTS.items():
        if key in UNSCORED:
            continue
        payload["features"].append(
            {
                "key": key,
                "label": key,
                "pillar": "familiarity",
                "unit": unit,
                "transform": "linear",
                "weight": 0.1,
                "definition": "Synthetic road feature for contract validation.",
            }
        )
        payload["bounds"][key] = {"lower": 0, "upper": 1}
    return payload


def test_expanded_release_keeps_unscored_measurements_out_of_ranking(release):
    expanded = DataRelease.model_validate(expanded_mock(release))
    assert len(expanded.features) == 15
    assert len(expanded.cities[0].features) == 17
    assert UNSCORED.isdisjoint(spec.key for spec in expanded.features)
    assert UNSCORED.isdisjoint(expanded.bounds)
    result = rank(expanded, RankingRequest())
    assert result.versions.model_version == "ranking.v2"
    assert result.ranked
    assert {factor.feature for factor in result.ranked[0].factors} == {
        spec.key for spec in expanded.features
    }


def test_expanded_scoring_requires_new_model_version(release):
    payload = expanded_mock(release)
    payload["versions"]["model_version"] = "ranking.v1"
    for city in payload["cities"]:
        city["versions"]["model_version"] = "ranking.v1"
    with pytest.raises(ValidationError, match="new model version"):
        DataRelease.model_validate(payload)


def test_road_measurements_enforce_domains_and_unscored_units(release):
    city = expanded_mock(release)["cities"][0]
    city["features"]["freeway_share"]["value"] = 0.2
    with pytest.raises(ValidationError, match="shares must sum to one"):
        CityFeature.model_validate(city)

    city["features"]["freeway_share"]["value"] = 0.3
    city["features"]["average_aadt"]["unit"] = "miles"
    with pytest.raises(ValidationError, match="Invalid unit: average_aadt"):
        CityFeature.model_validate(city)


def test_missing_unscored_measurement_stays_explicit(release):
    city = expanded_mock(release)["cities"][0]
    for key in UNSCORED:
        city["features"][key].update(
            value=None,
            quality="missing",
            missing_reason="No comparable public coverage.",
            provenance_ids=[],
        )
    validated = CityFeature.model_validate(city)
    assert validated.features["average_aadt"].value is None
    assert validated.features["average_aadt"].missing_reason == "No comparable public coverage."
    assert validated.features["lane_miles_per_km2"].value is None


def test_optional_road_measurements_do_not_change_expansion_scores(release):
    payload = expanded_mock(release)
    original = DataRelease.model_validate(payload)
    expected = {city.city_id: city.expansion_score for city in rank(original, RankingRequest()).ranked}

    for city in payload["cities"]:
        for key in UNSCORED:
            city["features"].pop(key)
    without_optional = DataRelease.model_validate(payload)
    actual = {city.city_id: city.expansion_score for city in rank(without_optional, RankingRequest()).ranked}
    assert actual == expected


def test_ranking_v2_registry_weights_and_transforms():
    config = json.loads((Path(__file__).parents[2] / "config" / "ranking.v2.json").read_text())
    specs = config["features"]
    assert len(specs) == 15
    assert UNSCORED.isdisjoint(spec["key"] for spec in specs)
    by_pillar = {
        pillar: [spec for spec in specs if spec["pillar"] == pillar]
        for pillar in ("familiarity", "readiness", "opportunity")
    }
    assert [len(by_pillar[pillar]) for pillar in ("familiarity", "readiness", "opportunity")] == [9, 2, 4]
    assert {spec["key"]: spec["weight"] for spec in by_pillar["familiarity"]} == {
        "annual_precipitation_mm": 0.10,
        "annual_snowfall_mm": 0.10,
        "hot_days_32c": 0.10,
        "mean_commute_minutes": 0.20,
        "road_density_km_per_km2": 0.10,
        "intersection_density_per_km2": 0.10,
        "freeway_share": 0.10,
        "arterial_share": 0.10,
        "local_road_share": 0.10,
    }
    assert sum(spec["weight"] for spec in by_pillar["familiarity"]) == pytest.approx(1.0)
    assert [config["weights"][key] for key in ("familiarity", "readiness", "opportunity")] == [0.4, 0.2, 0.4]
    assert [spec["weight"] for spec in by_pillar["readiness"]] == [0.70, 0.30]
    assert [spec["weight"] for spec in by_pillar["opportunity"]] == [0.30, 0.25, 0.30, 0.15]
    assert sum(spec["weight"] for spec in by_pillar["readiness"]) == pytest.approx(1.0)
    assert sum(spec["weight"] for spec in by_pillar["opportunity"]) == pytest.approx(1.0)
    transforms = {spec["key"]: spec["transform"] for spec in specs}
    assert transforms["annual_precipitation_mm"] == "log1p"
    assert transforms["annual_snowfall_mm"] == "log1p"
    assert transforms["hot_days_32c"] == "linear"
    assert transforms["road_density_km_per_km2"] == "log1p"
    assert transforms["intersection_density_per_km2"] == "log1p"


def test_missing_ranking_measurement_makes_city_unrankable(release):
    payload = expanded_mock(release)
    target_id = payload["candidate_ids"][0]
    city = next(city for city in payload["cities"] if city["city_id"] == target_id)
    city["features"]["annual_snowfall_mm"].update(
        value=None,
        quality="missing",
        missing_reason="No qualifying NOAA station coverage.",
        provenance_ids=[],
    )
    payload["normalization_cohort"].remove(target_id)
    result = rank(DataRelease.model_validate(payload), RankingRequest())
    target = next(city for city in result.unranked if city.city_id == target_id)
    assert target.expansion_score is None
    assert "Missing feature: annual_snowfall_mm" in target.exclusion_reasons
    assert target.coverage == pytest.approx(14 / 15)


def test_unscored_feature_cannot_enter_scored_registry(release):
    spec = release.features[0].model_dump()
    spec["key"] = "average_aadt"
    with pytest.raises(ValidationError):
        FeatureSpec.model_validate(spec)
