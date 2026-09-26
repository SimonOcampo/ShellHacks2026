from contracts.models import Explanation


def explain(release, ranking, city_id):
    city = next(c for c in release.cities if c.city_id == city_id)
    result = next(
        (r for r in ranking.ranked + ranking.unranked if r.city_id == city_id), None
    )
    if result is None:
        raise ValueError("Only candidate metros have expansion explanations")
    specs = {f.key: f for f in release.features}
    prefix = (
        "Illustrative mock ranking. " if release.versions.data_mode == "mock" else ""
    )
    if result.rank is None:
        return Explanation(
            ranking_id=ranking.ranking_id,
            city_id=city_id,
            mode="template",
            summary=prefix + city.display_name + " is unranked.",
            advantages=[],
            tradeoffs=result.exclusion_reasons,
            evidence_ids=[],
        )
    nearest_id = result.reference_matches[0].reference_id
    ref = next(r for r in release.references if r.id == nearest_id)
    ref_name = next(c.display_name for c in release.cities if c.city_id == ref.city_id)
    advantages = []
    for key in result.strongest_factor_ids:
        factor = next(f for f in result.factors if f.feature == key)
        if factor.pillar == "familiarity":
            advantages.append(
                f"{specs[key].label}: {factor.raw_value:,.2f} {specs[key].unit}; comparison reference {factor.reference_value:,.2f}."
            )
        else:
            advantages.append(
                f"{specs[key].label} contributes {factor.score_points:.1f} points to {factor.pillar}."
            )
    weights = ranking.normalized_weights
    return Explanation(
        ranking_id=ranking.ranking_id,
        city_id=city_id,
        mode="template",
        summary=f"{prefix}{city.display_name} ranks #{result.rank} with a screening score of {result.expansion_score:.1f}. {ref_name} is the nearest selected reference across climate and commuting proxies. Applied weights: familiarity {weights.familiarity:.0%}, readiness {weights.readiness:.0%}, opportunity {weights.opportunity:.0%}.",
        advantages=advantages,
        tradeoffs=[
            f"Lower relative factors: {', '.join(specs[k].label.lower() for k in result.weakest_factor_ids)}.",
            "Public charging does not establish secured fleet capacity. Regulatory review remains separate; this is not a safety or approval assessment.",
        ],
        evidence_ids=sorted(
            {p for f in result.factors for p in f.provenance_ids}
            | set(ref.provenance_ids)
        ),
    )
