from decimal import Decimal
import pytest
from contracts.models import SimulationRequest
from odd_scout.simulation.engine import (
    simulate,
    generate_requests,
    fare_cents,
    Ride,
    CapacityError,
)


def test_repeatable_and_accounting(release, settings):
    request = SimulationRequest(city_id="cbsa:33100", days=2, fleet_size=10)
    audit = {}
    a = simulate(request, settings, release.versions, audit=audit)
    assert a == simulate(request, settings, release.versions)
    m = a.metrics
    assert (
        m.total_requests
        == m.rides_completed + m.rejected_requests + m.unfinished_requests
    )
    assert sum(h.requests for h in a.hourly) == m.total_requests
    assert sum(h.completed_rides for h in a.hourly) == m.rides_completed
    assert sum(h.rejected_requests for h in a.hourly) == m.rejected_requests
    assert sum(Decimal(str(h.gross_revenue_usd)) for h in a.hourly) == Decimal(
        str(m.gross_revenue_usd)
    )
    assert sum(h.utilization_pct for h in a.hourly) / len(a.hourly) == pytest.approx(
        m.utilization_pct
    )
    assert audit["max_chargers"] <= settings.charger_count
    assert (
        audit["minimum_battery"]
        >= settings.reserve_fraction * settings.battery_range_miles - 1e-8
    )
    assert m.charging_vehicle_hours > 0
    assert m.paid_miles > 0 and m.empty_miles > 0


def test_request_stream_ignores_fleet_and_fares(settings):
    a = SimulationRequest(city_id="cbsa:33100", days=1)
    b = a.model_copy(update={"fleet_size": 1, "base_fare_usd": 30})
    assert generate_requests(a, settings) == generate_requests(b, settings)


def test_zero_demand(release, settings):
    result = simulate(
        SimulationRequest(city_id="cbsa:33100", demand_multiplier=0),
        settings,
        release.versions,
    )
    m = result.metrics
    assert (
        m.total_requests
        == m.rides_completed
        == m.rejected_requests
        == m.unfinished_requests
        == 0
    )
    assert (
        m.average_wait_minutes is None
        and m.p95_wait_minutes is None
        and m.empty_mile_pct is None
    )
    assert m.utilization_pct == m.gross_revenue_usd == 0


def test_cutoff_partial_miles_and_no_revenue(release, settings):
    request = SimulationRequest(city_id="cbsa:33100", days=1, fleet_size=1)
    result = simulate(
        request, settings, release.versions, rides=[Ride(1438, (0.0, 0.0), (5.0, 0.0))]
    )
    assert result.metrics.unfinished_requests == 1
    assert result.metrics.gross_revenue_usd == 0
    assert result.metrics.paid_miles == pytest.approx(1 / 3)
    assert result.metrics.average_wait_minutes is None


def test_no_double_assignment_and_fare_rounding(release, settings):
    request = SimulationRequest(
        city_id="cbsa:33100",
        days=1,
        fleet_size=1,
        base_fare_usd=0,
        price_per_mile_usd=0.01,
        price_per_minute_usd=0,
    )
    assert fare_cents(request, 0.5, 0) == 1
    result = simulate(
        request,
        settings,
        release.versions,
        rides=[Ride(0, (0.0, 0.0), (5.0, 0.0)), Ride(0, (0.0, 0.0), (5.0, 0.0))],
    )
    assert result.metrics.rides_completed == result.metrics.rejected_requests == 1


def test_queue_is_finite_and_measured(release, settings):
    assumptions = settings.model_copy(
        update={
            "charger_count": 1,
            "battery_range_miles": 60.0,
            "charge_range_miles_per_minute": 0.2,
        }
    )
    request = SimulationRequest(
        city_id="cbsa:33100", days=1, fleet_size=5, demand_multiplier=3
    )
    audit = {}
    result = simulate(request, assumptions, release.versions, audit=audit)
    assert audit["max_chargers"] == 1
    assert result.metrics.charging_queue_vehicle_hours > 0
    assert result.metrics.charging_vehicle_hours <= 24


def test_request_limit(settings):
    settings.base_requests_per_day = 200000
    with pytest.raises(CapacityError):
        generate_requests(SimulationRequest(city_id="cbsa:33100"), settings)
