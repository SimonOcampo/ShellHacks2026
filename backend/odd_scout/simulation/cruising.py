"""Assumed, deterministic Providence idle cruising policy."""

from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Literal

import numpy as np
from contracts.models import DTO, Positive
from pydantic import model_validator

from odd_scout.simulation.profile import DemandProfile


ROOT = Path(__file__).resolve().parents[3]
POLICY_PATH = ROOT / "config/providence-idle-cruising.v1.json"


class IdleCruisePolicy(DTO):
    version: Literal["providence-idle-cruising.v1"]
    speed_mph: Positive
    minimum_leg_miles: Positive
    maximum_leg_miles: Positive

    @model_validator(mode="after")
    def ordered(self):
        if self.minimum_leg_miles >= self.maximum_leg_miles:
            raise ValueError("Cruise leg minimum must be below maximum")
        return self


def load_idle_cruise_policy() -> IdleCruisePolicy:
    return IdleCruisePolicy.model_validate_json(POLICY_PATH.read_text(encoding="utf-8"))


class CruiseWaypoints:
    """Nearby RISM sample points weighted by 2015 modeled trip productions."""

    def __init__(self, profile: DemandProfile, policy: IdleCruisePolicy):
        self.policy = policy
        self.points = []
        self.weights = []
        self.cells = defaultdict(list)
        self.cell_miles = policy.maximum_leg_miles
        for zone in profile.zones:
            weight = zone.trip_production_2015 / len(zone.sample_points)
            for point in zone.sample_points:
                index = len(self.points)
                location = (point.x_miles, point.y_miles)
                self.points.append(location)
                self.weights.append(weight)
                self.cells[self._cell(location)].append(index)

    def _cell(self, position: tuple[float, float]) -> tuple[int, int]:
        return (
            math.floor(position[0] / self.cell_miles),
            math.floor(position[1] / self.cell_miles),
        )

    def choose(
        self, position: tuple[float, float], rng: np.random.Generator
    ) -> tuple[float, float] | None:
        cell_x, cell_y = self._cell(position)
        candidates = []
        for x in range(cell_x - 1, cell_x + 2):
            for y in range(cell_y - 1, cell_y + 2):
                for index in self.cells.get((x, y), ()):
                    point = self.points[index]
                    miles = math.dist(position, point)
                    if self.policy.minimum_leg_miles <= miles <= self.policy.maximum_leg_miles:
                        candidates.append(index)
        if not candidates:
            nearest = min(
                (
                    (math.dist(position, point), index)
                    for index, point in enumerate(self.points)
                    if math.dist(position, point) >= self.policy.minimum_leg_miles
                ),
                default=None,
            )
            if nearest is None:
                return None
            miles, index = nearest
            point = self.points[index]
            fraction = min(1.0, self.policy.maximum_leg_miles / miles)
            return (
                position[0] + (point[0] - position[0]) * fraction,
                position[1] + (point[1] - position[1]) * fraction,
            )
        weights = np.array([self.weights[index] for index in candidates], dtype=float)
        weights /= weights.sum()
        return self.points[int(rng.choice(candidates, p=weights))]
