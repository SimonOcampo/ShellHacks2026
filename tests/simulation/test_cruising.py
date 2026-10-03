"""The optimized selector must preserve the original policy and RNG stream."""

import math
from types import SimpleNamespace

import numpy as np
import pytest
from odd_scout.simulation.cruising import CruiseWaypoints, load_idle_cruise_policy
from odd_scout.simulation.profile import load_rism_profile


def original_choice(waypoints, position, rng):
    cell_x, cell_y = waypoints._cell(position)
    candidates = []
    for x in range(cell_x - 1, cell_x + 2):
        for y in range(cell_y - 1, cell_y + 2):
            for index in waypoints.cells.get((x, y), ()):
                miles = math.dist(position, waypoints.points[index])
                if (
                    waypoints.policy.minimum_leg_miles
                    <= miles
                    <= waypoints.policy.maximum_leg_miles
                ):
                    candidates.append(index)
    if not candidates:
        nearest = min(
            (
                (math.dist(position, point), index)
                for index, point in enumerate(waypoints.points)
                if math.dist(position, point) >= waypoints.policy.minimum_leg_miles
            ),
            default=None,
        )
        if nearest is None:
            return None
        miles, index = nearest
        point = waypoints.points[index]
        fraction = min(1.0, waypoints.policy.maximum_leg_miles / miles)
        return tuple(
            position[i] + (point[i] - position[i]) * fraction for i in range(2)
        )
    weights = np.array([waypoints.weights[index] for index in candidates], dtype=float)
    weights /= weights.sum()
    return waypoints.points[int(rng.choice(candidates, p=weights))]


@pytest.mark.parametrize("seed", [0, 42, 999])
def test_seeded_choices_and_rng_state_match_original(seed):
    waypoints = CruiseWaypoints(load_rism_profile(), load_idle_cruise_policy())
    actual_rng, original_rng = np.random.default_rng(seed), np.random.default_rng(seed)
    positions = [(0.0, 0.0), (100.0, -100.0), *waypoints.points[::11]]
    positions += [
        tuple(p) for p in np.random.default_rng(seed).uniform(-20, 20, (100, 2))
    ]
    # Repeated visits exercise cached probabilities while still drawing anew.
    for position in positions * 2:
        assert waypoints.choose(position, actual_rng) == original_choice(
            waypoints, position, original_rng
        )
    assert actual_rng.bit_generator.state == original_rng.bit_generator.state


def test_inclusive_boundaries_fallback_ties_and_empty_neighborhood():
    policy = load_idle_cruise_policy()
    points = [
        (policy.minimum_leg_miles, 0),
        (policy.maximum_leg_miles, 0),
        (np.nextafter(policy.minimum_leg_miles, 0), 0),
        (np.nextafter(policy.maximum_leg_miles, math.inf), 0),
        (-10, 0),
        (10, 0),
    ]
    profile = SimpleNamespace(
        zones=[
            SimpleNamespace(
                trip_production_2015=100,
                sample_points=[
                    SimpleNamespace(x_miles=x, y_miles=y) for x, y in points
                ],
            )
        ]
    )
    waypoints = CruiseWaypoints(profile, policy)
    actual_rng, original_rng = np.random.default_rng(42), np.random.default_rng(42)
    for position in [(0.0, 0.0), (0.0, 20.0), (0.0, 5.0)] * 20:
        assert waypoints.choose(position, actual_rng) == original_choice(
            waypoints, position, original_rng
        )
    empty = CruiseWaypoints(SimpleNamespace(zones=[]), policy)
    assert empty.choose((0.0, 0.0), actual_rng) is None


def test_geometry_is_reused_but_cache_is_bounded(monkeypatch):
    waypoints = CruiseWaypoints(load_rism_profile(), load_idle_cruise_policy())
    calls = 0
    original = waypoints._options

    def counted(position):
        nonlocal calls
        calls += 1
        return original(position)

    monkeypatch.setattr(waypoints, "_options", counted)
    rng = np.random.default_rng(42)
    for _ in range(100):
        waypoints.choose((0.0, 0.0), rng)
    assert calls == 1
    for i in range(4100):
        waypoints.choose((100 + i / 10000, 100), rng)
    assert len(waypoints._options_cache) == 4096
