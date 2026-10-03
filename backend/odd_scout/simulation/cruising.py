"""Assumed, deterministic Providence idle cruising policy."""

from __future__ import annotations

import math
from collections import OrderedDict, defaultdict
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
        # Cache geometry only; every visit still consumes its own seeded draw.
        # Per-run bounded storage avoids retaining profiles across API requests.
        self._options_cache = OrderedDict()
        for zone in profile.zones:
            weight = zone.trip_production_2015 / len(zone.sample_points)
            for point in zone.sample_points:
                index = len(self.points)
                location = (point.x_miles, point.y_miles)
                self.points.append(location)
                self.weights.append(weight)
                self.cells[self._cell(location)].append(index)
        self._coordinates = np.array(self.points, dtype=float).reshape(-1, 2)
        self._weights = np.array(self.weights, dtype=float)
        self._neighborhoods = {}

    def _cell(self, position: tuple[float, float]) -> tuple[int, int]:
        return (
            math.floor(position[0] / self.cell_miles),
            math.floor(position[1] / self.cell_miles),
        )

    def choose(
        self, position: tuple[float, float], rng: np.random.Generator
    ) -> tuple[float, float] | None:
        if position in self._options_cache:
            candidates, weights, fallback = self._options_cache[position]
            self._options_cache.move_to_end(position)
        else:
            candidates, weights, fallback = self._options(position)
            self._options_cache[position] = (candidates, weights, fallback)
            if len(self._options_cache) > 4096:
                self._options_cache.popitem(last=False)
        if len(candidates) == 0:
            return fallback
        return self.points[int(rng.choice(candidates, p=weights))]

    def _options(self, position: tuple[float, float]):
        cell_x, cell_y = self._cell(position)
        cell = (cell_x, cell_y)
        if cell not in self._neighborhoods:
            self._neighborhoods[cell] = np.array(
                [
                    index
                    for x in range(cell_x - 1, cell_x + 2)
                    for y in range(cell_y - 1, cell_y + 2)
                    for index in self.cells.get((x, y), ())
                ],
                dtype=np.intp,
            )
            if len(self._neighborhoods) > 4096:
                self._neighborhoods.pop(next(iter(self._neighborhoods)))
        indices = self._neighborhoods[cell]
        coordinates = self._coordinates[indices]
        deltas = coordinates - position
        distances = np.hypot(deltas[:, 0], deltas[:, 1])
        minimum, maximum = self.policy.minimum_leg_miles, self.policy.maximum_leg_miles
        # Preserve math.dist's inclusive boundary decisions despite rounding in
        # vectorized subtraction/hypot. Candidate order and RNG draws stay intact.
        scale = max(
            1.0,
            maximum,
            *map(abs, position),
            float(np.max(np.abs(coordinates), initial=0)),
        )
        tolerance = 8 * np.finfo(float).eps * scale
        boundary = (np.abs(distances - minimum) <= tolerance) | (
            np.abs(distances - maximum) <= tolerance
        )
        for offset in np.flatnonzero(boundary):
            distances[offset] = math.dist(position, self.points[indices[offset]])
        candidates = indices[(distances >= minimum) & (distances <= maximum)]
        if len(candidates) == 0:
            nearest = min(
                (
                    (math.dist(position, point), index)
                    for index, point in enumerate(self.points)
                    if math.dist(position, point) >= self.policy.minimum_leg_miles
                ),
                default=None,
            )
            if nearest is None:
                return candidates, None, None
            miles, index = nearest
            point = self.points[index]
            fraction = min(1.0, self.policy.maximum_leg_miles / miles)
            return (
                candidates,
                None,
                (
                    position[0] + (point[0] - position[0]) * fraction,
                    position[1] + (point[1] - position[1]) * fraction,
                ),
            )
        weights = self._weights[candidates].copy()
        weights /= weights.sum()
        return candidates, weights, None
