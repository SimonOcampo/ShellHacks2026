"""Build the verified Waymo reference-market release and its screening ranks."""

import json
from pathlib import Path

from contracts.models import (
    DataRelease,
    PillarWeights,
    RankingRequest,
    SimulationRequest,
)
from odd_ranking.engine import rank_reference_cities
from odd_scout.explanations.template import explain
from odd_scout.simulation.engine import simulate
from odd_scout.store import assumptions


ROOT = Path(__file__).resolve().parents[3]
SOURCE_RELEASE = ROOT / "data/releases/verified.v2.json"
ALL_CITY_FEATURES = ROOT / "data/data/processed/cities/all_city_features.json"
REFERENCE_MARKETS = (
    ROOT / "data/data/processed/reference_markets/reference_markets.json"
)
RANKING_CONFIG = ROOT / "config/ranking.v1.json"
OUTPUTS = (
    ROOT / "data/releases/backendreference.json",
    ROOT / "apps/web/public/backendreference.json",
)
RANKING_OUTPUTS = (
    ROOT / "data/releases/backendreference-ranking.json",
    ROOT / "apps/web/public/backendreference-ranking.json",
)
EXPLANATION_OUTPUTS = (
    ROOT / "data/releases/backendreference-explanations.json",
    ROOT / "apps/web/public/backendreference-explanations.json",
)
SIMULATION_OUTPUTS = (
    ROOT / "data/releases/backendreference-simulations.json",
    ROOT / "apps/web/public/backendreference-simulations.json",
)


def write_json(paths: tuple[Path, ...], content: str) -> None:
    for path in paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content + "\n", encoding="utf-8")


def build() -> None:
    release = DataRelease.model_validate_json(SOURCE_RELEASE.read_text(encoding="utf-8"))
    raw_cities = json.loads(ALL_CITY_FEATURES.read_text(encoding="utf-8"))
    feature_cities = {
        f"cbsa:{city['city_id']}": city for city in raw_cities
    }
    release_cities = {city.city_id: city for city in release.cities}
    if feature_cities.keys() != release_cities.keys():
        raise ValueError("All-city features and verified.v2 city coverage differ")

    scored_keys = {feature.key for feature in release.features}
    stale_commute_cities = []
    for city_id, source_city in feature_cities.items():
        for key in scored_keys:
            source_measurement = source_city["features"].get(key)
            release_measurement = release_cities[city_id].features.get(key)
            if source_measurement is None or release_measurement is None:
                raise ValueError(f"Scoring feature {key} is missing for {city_id}")
            if source_measurement["value"] != release_measurement.value:
                if key != "mean_commute_minutes":
                    raise ValueError(
                        f"Unexpected source difference for {city_id}: {key}"
                    )
                stale_commute_cities.append(city_id)
    source_references = json.loads(REFERENCE_MARKETS.read_text(encoding="utf-8"))
    source_reference_ids = {
        (f"cbsa:{item['city_id']}", item["id"])
        for item in source_references
        if item["enabled"] and item["operator"] == "Waymo"
    }
    release_references = [
        reference
        for reference in release.references
        if reference.enabled
        and reference.operator == "Waymo"
        and reference.category == "commercial"
    ]
    release_reference_ids = {
        (reference.city_id, reference.id) for reference in release_references
    }
    if source_reference_ids != release_reference_ids:
        raise ValueError("Processed and verified Waymo reference lists differ")

    reference_city_ids = sorted(reference.city_id for reference in release_references)
    for city_id in reference_city_ids:
        city = release_cities[city_id]
        if any(city.features[feature.key].value is None for feature in release.features):
            raise ValueError(f"Incomplete verified reference market: {city_id}")

    weights = json.loads(RANKING_CONFIG.read_text(encoding="utf-8"))["weights"]
    request = RankingRequest(
        weights=PillarWeights(**weights),
        reference_categories=["commercial"],
        compare_weights=PillarWeights(**weights),
    )
    ranking = rank_reference_cities(release, request, reference_city_ids)
    if len(ranking.ranked) != len(reference_city_ids) or ranking.unranked:
        raise ValueError("Every complete Waymo reference market must receive a rank")

    explanations = {
        city_id: explain(release, ranking, city_id).model_dump()
        for city_id in reference_city_ids
    }
    simulation_assumptions = assumptions(fleet_size=50)
    simulations = {
        city_id: simulate(
            SimulationRequest(city_id=city_id),
            simulation_assumptions,
            release.versions,
        ).model_dump()
        for city_id in reference_city_ids
    }

    write_json(OUTPUTS, release.model_dump_json(indent=2))
    write_json(RANKING_OUTPUTS, ranking.model_dump_json(indent=2))
    write_json(
        EXPLANATION_OUTPUTS,
        json.dumps(explanations, indent=2, ensure_ascii=False),
    )
    write_json(
        SIMULATION_OUTPUTS,
        json.dumps(simulations, indent=2, ensure_ascii=False),
    )
    print(
        f"Wrote verified.v2-based reference data for {len(reference_city_ids)} Waymo markets."
    )
    if stale_commute_cities:
        print(
            "The all-city file has older commute values for "
            f"{len(stale_commute_cities)} metros; verified.v2 values drive scoring."
        )
    else:
        print("All scoring values in the all-city file match verified.v2.")
    for result in ranking.ranked:
        city = release_cities[result.city_id]
        print(
            f"{result.rank:>2}. {city.display_name}: "
            f"{result.expansion_score:.1f}"
        )


if __name__ == "__main__":
    build()
