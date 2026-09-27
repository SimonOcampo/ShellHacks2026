import json
import math
import os
from pathlib import Path

from contracts.models import DataRelease, RankingResult, SimulationAssumptions

ROOT = Path(__file__).resolve().parents[2]


def load_release():
    mode = os.getenv("ODD_DATA_MODE", "mock")
    path = Path(
        os.getenv("ODD_DATA_RELEASE", str(ROOT / f"data/releases/{mode}.v1.json"))
    )
    release = DataRelease.model_validate_json(path.read_text(encoding="utf-8"))
    if release.versions.data_mode != mode:
        raise ValueError("ODD_DATA_MODE must match release; no implicit mock fallback")
    if mode == "verified":
        from odd_ranking.engine import rank
        from contracts.models import RankingRequest

        if len(rank(release, RankingRequest()).ranked) < 8:
            raise ValueError(
                "Verified demo requires at least eight complete candidates"
            )
    return release


def load_waymo_reference_release():
    path = ROOT / "data/releases/backendreference.json"
    release = DataRelease.model_validate_json(path.read_text(encoding="utf-8"))
    if release.versions.data_mode != "verified":
        raise ValueError("Waymo reference page requires the verified release")
    if release.versions.model_version != "ranking.v2":
        raise ValueError("Waymo reference page requires ranking.v2")
    if not any(
        reference.enabled and reference.operator == "Waymo"
        for reference in release.references
    ):
        raise ValueError("Waymo reference release has no enabled markets")
    return release


def load_waymo_reference_ranking():
    path = ROOT / "data/releases/backendreference-ranking.json"
    return RankingResult.model_validate_json(path.read_text(encoding="utf-8"))


def assumptions(fleet_size=50):
    values = json.loads((ROOT / "config/simulation.v1.json").read_text())
    values["charger_count"] = max(1, math.ceil(fleet_size / 10))
    return SimulationAssumptions(**values)


def default_weights():
    return json.loads((ROOT / "config/ranking.v1.json").read_text())["weights"]
