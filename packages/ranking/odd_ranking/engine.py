import hashlib
import json
import math

from contracts.models import (
    CityScore,
    DataRelease,
    FactorResult,
    PillarScores,
    PillarWeights,
    RankingRequest,
    RankingResult,
    ReferenceMatch,
)


def digest(value) -> str:
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode()
    ).hexdigest()[:20]


def transform(value: float, method: str) -> float:
    return math.log1p(value) if method == "log1p" else value


def rank(release: DataRelease, request: RankingRequest) -> RankingResult:
    cities = {c.city_id: c for c in release.cities}
    reference_map = {r.id: r for r in release.references}
    selected = (
        request.reference_ids
        if request.reference_ids is not None
        else [
            r.id for r in release.references if r.enabled and r.category == "commercial"
        ]
    )
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
            for f in active
        )

    def normalized(city, feature):
        b = release.bounds[feature.key]
        return min(
            1.0,
            max(
                0.0,
                (
                    transform(city.features[feature.key].value, feature.transform)
                    - b.lower
                )
                / (b.upper - b.lower),
            ),
        )

    for ref_id in selected:
        if not complete(cities[reference_map[ref_id].city_id]):
            raise ValueError(f"Incomplete reference: {ref_id}")
    results = []
    reference_city_ids = {r.city_id for r in release.references}
    for city_id in release.candidate_ids:
        city = cities[city_id]
        missing = [
            f.key
            for f in active
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
                coverage=(len(active) - len(missing)) / len(active) if active else 0,
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
    return RankingResult(
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
