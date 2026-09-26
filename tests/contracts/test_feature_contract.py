import pytest
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
    city["features"]["average_aadt"].update(
        value=None,
        quality="missing",
        missing_reason="No comparable public coverage.",
        provenance_ids=[],
    )
    validated = CityFeature.model_validate(city)
    assert validated.features["average_aadt"].value is None
    assert validated.features["average_aadt"].missing_reason == "No comparable public coverage."


def test_unscored_feature_cannot_enter_scored_registry(release):
    spec = release.features[0].model_dump()
    spec["key"] = "average_aadt"
    with pytest.raises(ValidationError):
        FeatureSpec.model_validate(spec)
