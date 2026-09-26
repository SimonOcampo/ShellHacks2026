import math

import pytest
from contracts.models import Bounds, CityFeature, DataRelease, FeatureSpec, PillarWeights, RankingRequest
from odd_ranking.engine import rank
from odd_ranking.normalization import (
    NormalizationError,
    freeze_bounds,
    load_feature_registry,
    normalize_value,
    transform_value,
)


def expanded_release(release, *, optional_values=True):
    payload = release.model_dump(mode="json")
    payload["versions"]["model_version"] = "ranking.v2"
    registry = load_feature_registry()
    unit_by_key = {spec.key: spec.unit for spec in registry}
    cities = payload["cities"]
    for index, city in enumerate(cities):
        city["versions"]["model_version"] = "ranking.v2"
        for key, unit in unit_by_key.items():
            if key in city["features"]:
                city["features"][key]["unit"] = unit
        provenance_id = city["provenance"][0]["id"]
        city["features"].update(
            {
                "road_density_km_per_km2": {
                    "value": 0.2 + index * 0.01,
                    "unit": "km/km2",
                    "quality": "proxy",
                    "missing_reason": None,
                    "provenance_ids": [provenance_id],
                },
                "intersection_density_per_km2": {
                    "value": 0.3 + index * 0.02,
                    "unit": "intersections/km2",
                    "quality": "proxy",
                    "missing_reason": None,
                    "provenance_ids": [provenance_id],
                },
                "freeway_share": {
                    "value": 0.2 + index * 0.001,
                    "unit": "fraction",
                    "quality": "proxy",
                    "missing_reason": None,
                    "provenance_ids": [provenance_id],
                },
                "arterial_share": {
                    "value": 0.3,
                    "unit": "fraction",
                    "quality": "proxy",
                    "missing_reason": None,
                    "provenance_ids": [provenance_id],
                },
                "local_road_share": {
                    "value": 0.5 - index * 0.001,
                    "unit": "fraction",
                    "quality": "proxy",
                    "missing_reason": None,
                    "provenance_ids": [provenance_id],
                },
            }
        )
        if optional_values:
            city["features"].update(
                {
                    "average_aadt": {
                        "value": 1000 + index,
                        "unit": "vehicles/day",
                        "quality": "proxy",
                        "missing_reason": None,
                        "provenance_ids": [provenance_id],
                    },
                    "lane_miles_per_km2": {
                        "value": 3 + index,
                        "unit": "lane-miles/km2",
                        "quality": "proxy",
                        "missing_reason": None,
                        "provenance_ids": [provenance_id],
                    },
                }
            )
    cities_by_id = {city["city_id"]: city for city in cities}
    typed_cities = {
        city_id: CityFeature.model_validate(city) for city_id, city in cities_by_id.items()
    }
    candidate_ids = payload["candidate_ids"]
    cohort = sorted(
        set(candidate_ids)
        | {reference["city_id"] for reference in payload["references"] if reference["enabled"]}
    )
    typed_specs = tuple(FeatureSpec.model_validate(spec.model_dump(mode="json")) for spec in registry)
    bounds = freeze_bounds(typed_cities, typed_specs, cohort)
    payload["features"] = [spec.model_dump(mode="json") for spec in registry]
    payload["bounds"] = {key: value.model_dump(mode="json") for key, value in bounds.items()}
    payload["normalization_cohort"] = cohort
    return DataRelease.model_validate(payload)


def test_ranking_v2_registry_declares_all_fifteen_transforms_and_weights():
    registry = load_feature_registry()
    assert len(registry) == 15
    assert {spec.key: spec.transform for spec in registry} == {
        "annual_precipitation_mm": "log1p",
        "annual_snowfall_mm": "log1p",
        "hot_days_32c": "linear",
        "mean_commute_minutes": "linear",
        "road_density_km_per_km2": "log1p",
        "intersection_density_per_km2": "log1p",
        "freeway_share": "linear",
        "arterial_share": "linear",
        "local_road_share": "linear",
        "public_dc_ports_per_100k": "log1p",
        "population_share_in_counties_with_dc": "linear",
        "population": "log1p",
        "population_density_per_km2": "log1p",
        "zero_vehicle_household_share": "linear",
        "transit_commute_share": "linear",
    }
    assert sum(spec.weight for spec in registry if spec.pillar == "familiarity") == pytest.approx(1)
    assert sum(spec.weight for spec in registry if spec.pillar == "readiness") == pytest.approx(1)
    assert sum(spec.weight for spec in registry if spec.pillar == "opportunity") == pytest.approx(1)


def test_linear_normalization_uses_expected_min_mid_max_and_clips():
    spec = next(item for item in load_feature_registry() if item.key == "hot_days_32c")
    bounds = Bounds(lower=10, upper=30)
    assert normalize_value(10, spec, bounds) == 0
    assert normalize_value(20, spec, bounds) == 0.5
    assert normalize_value(30, spec, bounds) == 1
    assert normalize_value(5, spec, bounds) == 0
    assert normalize_value(50, spec, bounds) == 1


def test_log1p_transforms_before_finding_and_using_bounds():
    spec = next(item for item in load_feature_registry() if item.key == "population")
    lower, upper = transform_value(0, "log1p"), transform_value(15, "log1p")
    assert lower == 0
    assert upper == pytest.approx(math.log(16))
    assert normalize_value(3, spec, Bounds(lower=lower, upper=upper)) == pytest.approx(0.5)
    assert normalize_value(0, spec, Bounds(lower=lower, upper=upper)) == 0
    assert normalize_value(30, spec, Bounds(lower=lower, upper=upper)) == 1


def test_invalid_transforms_and_nonfinite_or_negative_log_inputs_fail():
    with pytest.raises(NormalizationError, match="Unknown transform"):
        transform_value(1, "square")
    with pytest.raises(NormalizationError, match="nonnegative"):
        transform_value(-0.1, "log1p")
    for value in (math.nan, math.inf, -math.inf):
        with pytest.raises(NormalizationError, match="finite"):
            transform_value(value, "linear")


def test_constant_feature_is_removed_globally_and_bounds_are_fixed(release):
    expanded = expanded_release(release)
    result = rank(expanded, RankingRequest())
    assert len(result.ranked) == len(expanded.candidate_ids)
    constant_features = {
        key for key, bounds in expanded.bounds.items() if bounds.lower == bounds.upper
    }
    assert constant_features == {"arterial_share"}
    assert all(
        factor.feature not in constant_features
        for city in result.ranked
        for factor in city.factors
    )
    assert {factor.feature for factor in result.ranked[0].factors} == {
        spec.key
        for spec in expanded.features
        if spec.key not in constant_features
    }


def test_v2_familiarity_uses_one_nearest_whole_reference_vector(release):
    expanded = expanded_release(release)
    result = rank(expanded, RankingRequest())
    scored_city = result.ranked[0]
    match = scored_city.reference_matches[0]
    ref = next(item for item in expanded.references if item.id == match.reference_id)
    reference_city = next(city for city in expanded.cities if city.city_id == ref.city_id)
    candidate_city = next(city for city in expanded.cities if city.city_id == scored_city.city_id)
    active_familiarity = [
        feature
        for feature in expanded.features
        if feature.pillar == "familiarity"
        and expanded.bounds[feature.key].upper > expanded.bounds[feature.key].lower
    ]
    weight_total = sum(feature.weight for feature in active_familiarity)
    squared_distance = 0.0
    for feature in active_familiarity:
        candidate_value = normalize_value(
            candidate_city.features[feature.key].value,
            feature,
            expanded.bounds[feature.key],
        )
        reference_value = normalize_value(
            reference_city.features[feature.key].value,
            feature,
            expanded.bounds[feature.key],
        )
        squared_distance += feature.weight / weight_total * (candidate_value - reference_value) ** 2
    assert match.distance == pytest.approx(math.sqrt(squared_distance))
    assert match.similarity == pytest.approx(100 * (1 - match.distance))
    assert scored_city.pillars.familiarity == pytest.approx(match.similarity)


def test_normalized_ranking_is_unchanged_by_optional_road_fields(release):
    with_optional = expanded_release(release, optional_values=True)
    without_optional = expanded_release(release, optional_values=False)
    assert with_optional.bounds == without_optional.bounds
    assert with_optional.normalization_cohort == without_optional.normalization_cohort
    scored_with = rank(with_optional, RankingRequest())
    scored_without = rank(without_optional, RankingRequest())
    assert [
        (city.city_id, city.expansion_score, [f.normalized_value for f in city.factors])
        for city in scored_with.ranked
    ] == [
        (city.city_id, city.expansion_score, [f.normalized_value for f in city.factors])
        for city in scored_without.ranked
    ]


def test_pillar_weight_changes_do_not_refit_v2_bounds_or_normalized_features(release):
    expanded = expanded_release(release)
    before_bounds = expanded.bounds.copy()
    before_cohort = expanded.normalization_cohort.copy()
    default = rank(expanded, RankingRequest())
    changed = rank(
        expanded,
        RankingRequest(weights=PillarWeights(familiarity=0, readiness=0, opportunity=1)),
    )
    assert expanded.bounds == before_bounds
    assert expanded.normalization_cohort == before_cohort
    default_city = next(city for city in default.ranked if city.city_id == expanded.candidate_ids[0])
    changed_city = next(city for city in changed.ranked if city.city_id == expanded.candidate_ids[0])
    assert [factor.normalized_value for factor in default_city.factors] == [
        factor.normalized_value for factor in changed_city.factors
    ]


def test_incomplete_city_does_not_participate_as_zero(release):
    payload = expanded_release(release).model_dump(mode="json")
    city = next(item for item in payload["cities"] if item["city_id"] == payload["candidate_ids"][0])
    city["features"]["annual_snowfall_mm"].update(
        value=None,
        quality="missing",
        missing_reason="No snowfall value.",
        provenance_ids=[],
    )
    payload["normalization_cohort"].remove(city["city_id"])
    # Bounds are frozen over the original cohort and remain unchanged.
    result = rank(DataRelease.model_validate(payload), RankingRequest())
    unranked = next(item for item in result.unranked if item.city_id == city["city_id"])
    assert "Missing feature: annual_snowfall_mm" in unranked.exclusion_reasons
    assert unranked.expansion_score is None
    assert unranked.coverage < 1
