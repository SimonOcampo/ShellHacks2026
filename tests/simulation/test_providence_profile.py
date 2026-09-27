import math
from collections import defaultdict
from hashlib import sha256
from itertools import pairwise

import pytest
from contracts.models import SimulationRequest
from fastapi.testclient import TestClient
from odd_scout.api.main import app
from odd_scout.simulation.engine import Ride, generate_requests, simulate
from odd_scout.simulation.profile import (
    RISM_ARTIFACT_SHA256,
    RISM_PATH,
    load_rism_profile,
)


def test_public_profile_is_pinned_and_seeded(settings):
    profile = load_rism_profile()
    assert sha256(RISM_PATH.read_bytes()).hexdigest() == RISM_ARTIFACT_SHA256
    assert profile.source.kind == "public_model_proxy"
    assert (
        profile.source.raw_sha256
        == "4ba6796ac38f08c178dfcf81c555109989db235d33fcc5783b62c248dbe96ba6"
    )
    assert len(profile.zones) == 86
    assert profile.origin_longitude < -71 and profile.origin_latitude > 41

    request = SimulationRequest(
        city_id="cbsa:39300", days=1, demand_profile_id=profile.source.profile_id
    )
    a = settings.model_copy(update={"profile_id": profile.source.profile_id})
    changed_fare_and_fleet = request.model_copy(
        update={"fleet_size": 7, "base_fare_usd": 20}
    )
    rides = generate_requests(request, a, demand_profile=profile)
    assert rides == generate_requests(changed_fare_and_fleet, a, demand_profile=profile)
    zone_points = {
        (point.x_miles, point.y_miles)
        for zone in profile.zones
        for point in zone.sample_points
    }
    assert rides and all(
        ride.origin in zone_points and ride.destination in zone_points for ride in rides
    )


def test_playback_covers_each_vehicle_and_matches_accounting(release, settings):
    request = SimulationRequest(
        city_id="cbsa:39300", fleet_size=2, days=1, include_playback=True
    )
    result = simulate(
        request,
        settings.model_copy(update={"charger_count": 1}),
        release.versions,
        rides=[Ride(10, (1.0, 0.0), (2.0, 0.0))],
    )
    without_playback = simulate(
        request.model_copy(update={"include_playback": False}),
        settings.model_copy(update={"charger_count": 1}),
        release.versions,
        rides=[Ride(10, (1.0, 0.0), (2.0, 0.0))],
    )
    assert result.simulation_id == without_playback.simulation_id
    assert result.metrics == without_playback.metrics
    assert result.metrics.total_requests == result.metrics.rides_completed == 1
    assert result.playback is not None
    by_vehicle = defaultdict(list)
    for segment in result.playback.segments:
        assert 0 <= segment.start_minute < segment.end_minute <= 1440
        assert all(
            math.isfinite(value)
            for value in (
                segment.from_x_miles,
                segment.from_y_miles,
                segment.to_x_miles,
                segment.to_y_miles,
            )
        )
        assert segment.occupied == (
            segment.state in {"PASSENGER_TRAVEL", "DROPOFF_DWELL"}
        )
        by_vehicle[segment.vehicle_id].append(segment)
    assert set(by_vehicle) == {0, 1}
    states = {segment.state for segment in result.playback.segments}
    assert {
        "IDLE",
        "PICKUP_TRAVEL",
        "PICKUP_DWELL",
        "PASSENGER_TRAVEL",
        "DROPOFF_DWELL",
    } <= states
    for segments in by_vehicle.values():
        assert segments[0].start_minute == 0
        assert segments[-1].end_minute == 1440
        for previous, current in pairwise(segments):
            assert current.start_minute == pytest.approx(previous.end_minute)


def test_providence_profile_api_returns_source_and_playback(monkeypatch):
    monkeypatch.setenv("ODD_DATA_MODE", "verified")
    monkeypatch.setenv(
        "ODD_DATA_RELEASE", str(RISM_PATH.parents[3] / "data/releases/verified.v2.json")
    )
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/simulations",
            json={
                "city_id": "cbsa:39300",
                "days": 1,
                "fleet_size": 10,
                "demand_profile_id": "providence-rism-2015.v1",
                "include_playback": True,
            },
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["demand_source"]["kind"] == "public_model_proxy"
        assert data["demand_source"]["artifact_sha256"] == RISM_ARTIFACT_SHA256
        assert data["playback"]["origin_longitude"] < -71
        assert data["playback"]["segments"]
        metrics = data["metrics"]
        assert metrics["total_requests"] == (
            metrics["rides_completed"]
            + metrics["rejected_requests"]
            + metrics["unfinished_requests"]
        )
        wrong_city = client.post(
            "/api/v1/simulations",
            json={
                "city_id": "cbsa:33100",
                "demand_profile_id": "providence-rism-2015.v1",
            },
        )
        assert wrong_city.status_code == 422
