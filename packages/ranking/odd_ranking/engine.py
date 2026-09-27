import hashlib
import json
import math

from contracts.models import (
    RANKING_V2_KEYS,
    CityScore,
    DataRelease,
    FactorResult,
    PillarScores,
    PillarWeights,
    RankingRequest,
    RankingResult,
    ReferenceMatch,
    WeightChange,
    WeightSensitivity,
)

from odd_ranking.normalization import normalize_value


def digest(value) -> str:
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode()
    ).hexdigest()[:20]


def rank(release: DataRelease, request: RankingRequest) -> RankingResult:
    if release.versions.model_version == "ranking.v2" and {
        feature.key for feature in release.features
    } != RANKING_V2_KEYS:
        raise ValueError("ranking.v2 requires exactly 15 active scoring features")
    if release.versions.model_version not in {"ranking.v1", "ranking.v2"}:
        raise ValueError(
            f"Unsupported ranking model version: {release.versions.model_version}"
        )
    cities = {c.city_id: c for c in release.cities}
    reference_map = {r.id: r for r in release.references}
    selected = request.reference_ids
    if selected is None:
        categories = request.reference_categories or ["commercial"]
        selected = [
            r.id for r in release.references if r.enabled and r.category in categories
        ]
    if (
        not selected
        or len(set(selected)) != len(selected)
        or any(r not in reference_map or not reference_map[r].enabled for r in selected)
    ):
        raise ValueError("Select nonempty, unique, enabled reference IDs")
    selected = sorted(selected)
    active = [
        f
        for f in release.features
        if release.bounds[f.key].upper > release.bounds[f.key].lower
    ]
    grouped = {
        p: [f for f in active if f.pillar == p]
        for p in ("familiarity", "readiness", "opportunity")
    }
    weights = request.weights.model_dump()
    total = sum(weights.values())
    weights = {p: w / total for p, w in weights.items()}

    def complete(city):
        return all(
            f.key in city.features and city.features[f.key].value is not None
            for f in release.features
        )

    def normalized(city, feature):
        b = release.bounds[feature.key]
        value = normalize_value(city.features[feature.key].value, feature, b)
        if value is None:
            raise ValueError(f"Constant feature entered active scoring: {feature.key}")
        return value

    for ref_id in selected:
        if not complete(cities[reference_map[ref_id].city_id]):
            raise ValueError(f"Incomplete reference: {ref_id}")
    results = []
    reference_city_ids = {r.city_id for r in release.references}
    for city_id in release.candidate_ids:
        city = cities[city_id]
        missing = [
            f.key
            for f in release.features
            if f.key not in city.features or city.features[f.key].value is None
        ]
        reasons = [f"Missing feature: {f}" for f in missing]
        reasons.extend(
            f"No discriminating features in {p}" for p, fs in grouped.items() if not fs
        )
        if city_id in reference_city_ids:
            reasons.append("Reference metro excluded from expansion shortlist")
        matches = []
        factors = []
        scores = dict.fromkeys(grouped, None)
        if not reasons:
            fam = grouped["familiarity"]
            fw = sum(f.weight for f in fam)
            seen = set()
            for ref_id in selected:
                ref = cities[reference_map[ref_id].city_id]
                if ref.city_id == city_id:
                    continue
                vector = tuple(normalized(ref, f) for f in fam)
                if vector in seen:
                    continue
                seen.add(vector)
                distance = math.sqrt(
                    sum(
                        f.weight / fw * (normalized(city, f) - normalized(ref, f)) ** 2
                        for f in fam
                    )
                )
                matches.append(
                    ReferenceMatch(
                        reference_id=ref_id,
                        distance=distance,
                        similarity=100 * (1 - min(1, distance)),
                    )
                )
            matches.sort(key=lambda m: (m.distance, m.reference_id))
            if not matches:
                reasons.append("No non-self reference available")
            else:
                nearest = cities[reference_map[matches[0].reference_id].city_id]
                scores["familiarity"] = matches[0].similarity
                for pillar, fs in grouped.items():
                    weight_sum = sum(f.weight for f in fs)
                    if pillar != "familiarity":
                        scores[pillar] = sum(
                            100 * f.weight / weight_sum * normalized(city, f)
                            for f in fs
                        )
                    for f in fs:
                        value = normalized(city, f)
                        is_fam = pillar == "familiarity"
                        factors.append(
                            FactorResult(
                                feature=f.key,
                                pillar=pillar,
                                raw_value=city.features[f.key].value,
                                normalized_value=value,
                                reference_value=nearest.features[f.key].value
                                if is_fam
                                else None,
                                distance_component=f.weight
                                / weight_sum
                                * (value - normalized(nearest, f)) ** 2
                                if is_fam
                                else None,
                                score_points=None
                                if is_fam
                                else 100 * f.weight / weight_sum * value,
                                provenance_ids=city.features[f.key].provenance_ids,
                            )
                        )
        # Rank strengths by comparable feature performance, not differing additive weights.
        performance = sorted(
            factors,
            key=lambda f: (
                (1 - math.sqrt(f.distance_component))
                if f.pillar == "familiarity"
                else f.normalized_value,
                f.feature,
            ),
        )
        results.append(
            CityScore(
                city_id=city_id,
                rank=None,
                expansion_score=None
                if reasons
                else sum(weights[p] * scores[p] for p in weights),
                pillars=PillarScores(**scores),
                coverage=(len(release.features) - len(missing)) / len(release.features)
                if release.features
                else 0,
                exclusion_reasons=reasons,
                factors=factors,
                reference_matches=matches[:3],
                strongest_factor_ids=[f.feature for f in performance[-2:][::-1]],
                weakest_factor_ids=[f.feature for f in performance[:2]],
                legal_flags=[e.summary for e in city.legal_evidence],
            )
        )
    ranked = sorted(
        [r for r in results if r.expansion_score is not None],
        key=lambda r: (-r.expansion_score, r.city_id),
    )
    for index, result in enumerate(ranked, 1):
        result.rank = index
    result = RankingResult(
        versions=release.versions,
        ranking_id=digest(
            {
                "release": release.model_dump(),
                "weights": weights,
                "references": selected,
            }
        ),
        normalized_weights=PillarWeights(**weights),
        reference_ids=selected,
        ranked=ranked,
        unranked=sorted(
            [r for r in results if r.expansion_score is None], key=lambda r: r.city_id
        ),
    )
    if request.compare_weights is not None:
        baseline = rank(
            release,
            request.model_copy(
                update={"weights": request.compare_weights, "compare_weights": None}
            ),
        )
        baseline_by_id = {city.city_id: city for city in baseline.ranked}
        result.weight_sensitivity = WeightSensitivity(
            baseline_ranking_id=baseline.ranking_id,
            baseline_weights=baseline.normalized_weights,
            changes=[
                WeightChange(
                    city_id=city.city_id,
                    baseline_rank=baseline_by_id[city.city_id].rank,
                    baseline_score=baseline_by_id[city.city_id].expansion_score,
                    rank_change=baseline_by_id[city.city_id].rank - city.rank,
                    score_change=city.expansion_score
                    - baseline_by_id[city.city_id].expansion_score,
                )
                for city in result.ranked
            ],
        )
    return result
