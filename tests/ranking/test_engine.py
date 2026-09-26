import math
import pytest
from contracts.models import RankingRequest, PillarWeights
from odd_ranking.engine import rank


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
