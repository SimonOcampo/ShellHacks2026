import math

import pytest
from contracts.models import PillarWeights, RankingRequest
from odd_ranking.engine import rank, rank_reference_cities
from pydantic import ValidationError


def test_rank_reproducible_and_explainable(release):
    result = rank(release, RankingRequest())
    assert result == rank(release, RankingRequest())
    assert len(result.ranked) == 20
    for city in result.ranked:
        assert 0 <= city.expansion_score <= 100
        assert city.expansion_score == pytest.approx(
            0.4 * city.pillars.familiarity
            + 0.2 * city.pillars.readiness
            + 0.4 * city.pillars.opportunity
        )
        for pillar in ["readiness", "opportunity"]:
            assert sum(
                f.score_points for f in city.factors if f.pillar == pillar
            ) == pytest.approx(getattr(city.pillars, pillar))
        assert 100 * (
            1
            - math.sqrt(
                sum(
                    f.distance_component
                    for f in city.factors
                    if f.pillar == "familiarity"
                )
            )
        ) == pytest.approx(city.pillars.familiarity)


def test_identical_vector_and_nearest_whole_reference(release):
    candidate = release.cities[0]
    ref = next(c for c in release.cities if c.city_id == release.references[0].city_id)
    candidate.features = ref.features.copy()
    result = next(
        c
        for c in rank(release, RankingRequest()).ranked
        if c.city_id == candidate.city_id
    )
    assert result.pillars.familiarity == 100
    assert result.reference_matches[0].reference_id == release.references[0].id
    candidate.features["mean_commute_minutes"] = candidate.features[
        "mean_commute_minutes"
    ].model_copy(update={"value": 30})
    result2 = next(
        c
        for c in rank(
            release, RankingRequest(reference_ids=[release.references[0].id])
        ).ranked
        if c.city_id == candidate.city_id
    )
    assert result2.pillars.familiarity < 100


def test_missing_does_not_impute(release):
    city = release.cities[0]
    del city.features["population"]
    result = rank(release, RankingRequest())
    assert result.unranked[0].city_id == city.city_id
    assert result.unranked[0].expansion_score is None
    assert result.unranked[0].coverage == 0.9


def test_weights_never_refit_bounds(release):
    before = release.model_dump_json()
    a = rank(release, RankingRequest())
    b = rank(
        release,
        RankingRequest(
            weights=PillarWeights(familiarity=0, readiness=0, opportunity=2)
        ),
    )
    assert release.model_dump_json() == before
    assert a.ranking_id != b.ranking_id
    assert b.normalized_weights.opportunity == 1


def test_reference_category_and_unknown(release):
    release.references[0].category = "testing"
    result = rank(release, RankingRequest())
    assert release.references[0].id not in result.reference_ids
    release.references[0].enabled = False
    for ids in [[], ["unknown"], [release.references[0].id]]:
        with pytest.raises(ValueError):
            rank(release, RankingRequest(reference_ids=ids))


def test_reference_categories_select_enabled_whole_markets(release):
    release.references[0].category = "testing"
    selected = rank(release, RankingRequest(reference_categories=["testing"]))
    assert selected.reference_ids == [release.references[0].id]
    assert selected == rank(release, RankingRequest(reference_ids=selected.reference_ids))
    with pytest.raises(ValueError, match="Select nonempty"):
        rank(release, RankingRequest(reference_categories=["announced"]))
    with pytest.raises(ValidationError):
        RankingRequest(reference_categories=[])
    with pytest.raises(ValidationError):
        RankingRequest(reference_categories=["testing", "testing"])
    with pytest.raises(ValidationError):
        RankingRequest(reference_ids=[selected.reference_ids[0]], reference_categories=["testing"])
    release.references[0].enabled = False
    with pytest.raises(ValueError, match="Select nonempty"):
        rank(release, RankingRequest(reference_categories=["testing"]))


def test_weight_sensitivity_uses_same_references_and_frozen_bounds(release):
    before = release.model_dump_json()
    base_weights = PillarWeights()
    scenario_weights = PillarWeights(familiarity=0.1, readiness=0.6, opportunity=0.3)
    scenario = rank(
        release,
        RankingRequest(
            weights=scenario_weights,
            reference_categories=["commercial"],
            compare_weights=base_weights,
        ),
    )
    baseline = rank(release, RankingRequest(weights=base_weights))
    assert scenario.weight_sensitivity.baseline_ranking_id == baseline.ranking_id
    assert scenario.reference_ids == baseline.reference_ids
    assert release.model_dump_json() == before
    assert scenario == rank(
        release,
        RankingRequest(weights=scenario_weights, reference_categories=["commercial"], compare_weights=base_weights),
    )
    baseline_by_id = {city.city_id: city for city in baseline.ranked}
    for city, change in zip(scenario.ranked, scenario.weight_sensitivity.changes):
        previous = baseline_by_id[city.city_id]
        assert change.city_id == city.city_id
        assert change.rank_change == previous.rank - city.rank
        assert change.score_change == pytest.approx(city.expansion_score - previous.expansion_score)
    assert any(change.rank_change for change in scenario.weight_sensitivity.changes)


def test_constant_pillar_and_self_reference(release):
    reference = release.references[0]
    release.candidate_ids.append(reference.city_id)
    result = rank(release, RankingRequest())
    assert any(c.city_id == reference.city_id for c in result.unranked)
    for f in release.features:
        if f.pillar == "readiness":
            release.bounds[f.key].upper = release.bounds[f.key].lower
    result = rank(release, RankingRequest())
    assert not result.ranked
    assert all(
        any("No discriminating" in reason for reason in c.exclusion_reasons)
        for c in result.unranked
    )


def test_reference_comparison_reuses_pillars_without_changing_candidate_ranking(release):
    city_ids = [reference.city_id for reference in release.references[:3]]
    candidates = rank(release, RankingRequest())
    comparison = rank_reference_cities(release, RankingRequest(), city_ids)
    assert {score.city_id for score in comparison.ranked} == set(city_ids)
    assert [score.rank for score in comparison.ranked] == [1, 2, 3]
    assert all(
        match.reference_id != reference.id
        for score in comparison.ranked
        for match in score.reference_matches
        for reference in release.references
        if reference.city_id == score.city_id
    )
    assert rank(release, RankingRequest()) == candidates
    with pytest.raises(ValueError, match="reference city IDs"):
        rank_reference_cities(release, RankingRequest(), [release.candidate_ids[0]])
