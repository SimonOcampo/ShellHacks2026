from collections import deque
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
import heapq
import itertools
import math

import numpy as np

from contracts.models import (
    SimulationRequest,
    SimulationAssumptions,
    SimulationMetrics,
    SimulationResult,
    HourlyMetrics,
    VersionStamp,
)
from odd_ranking.engine import digest


class CapacityError(ValueError):
    pass


@dataclass(frozen=True)
class Ride:
    time: float
    origin: tuple[float, float]
    destination: tuple[float, float]


@dataclass
class Vehicle:
    position: tuple[float, float]
    battery: float
    state: str = "IDLE"
    queued_at: float = 0


def generate_requests(
    request: SimulationRequest, assumptions: SimulationAssumptions
) -> list[Ride]:
    seeds = np.random.SeedSequence(request.seed).spawn(2)
    demand, locations = (np.random.default_rng(s) for s in seeds)
    weights = np.array(assumptions.hourly_demand_weights, dtype=float)
    weights /= weights.sum()
    counts = demand.poisson(
        np.tile(weights, request.days)
        * assumptions.base_requests_per_day
        * request.demand_multiplier
    )
    if int(counts.sum()) > 100_000:
        raise CapacityError(
            "Simulation exceeds 100,000 requests; reduce demand or duration"
        )

    def point():
        radius = assumptions.service_zone_radius_miles * math.sqrt(locations.random())
        angle = locations.uniform(0, 2 * math.pi)
        return (radius * math.cos(angle), radius * math.sin(angle))

    rides = []
    for hour, count in enumerate(counts):
        for timestamp in sorted(demand.uniform(hour * 60, (hour + 1) * 60, int(count))):
            rides.append(Ride(float(timestamp), point(), point()))
    return rides


def fare_cents(request, miles, minutes):
    fare = (
        Decimal(str(request.base_fare_usd))
        + Decimal(str(request.price_per_mile_usd)) * Decimal(str(miles))
        + Decimal(str(request.price_per_minute_usd)) * Decimal(str(minutes))
    )
    return int((fare * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def simulate(
    request: SimulationRequest,
    assumptions: SimulationAssumptions,
    versions: VersionStamp,
    *,
    rides: list[Ride] | None = None,
    audit: dict | None = None,
) -> SimulationResult:
    rides = generate_requests(request, assumptions) if rides is None else rides
    if len(rides) > 100_000:
        raise CapacityError("Simulation exceeds 100,000 requests")
    a = assumptions
    hours = request.days * 24
    horizon = hours * 60.0
    if any(not 0 <= r.time < horizon for r in rides):
        raise ValueError("Requests must fall inside simulation window")
    fleet = [
        Vehicle((0.0, 0.0), a.battery_range_miles) for _ in range(request.fleet_size)
    ]
    events, sequence, queue = [], itertools.count(), deque()
    active_chargers = 0
    max_chargers = 0
    minimum_battery = a.battery_range_miles
    totals = dict(
        paid=0.0, empty=0.0, service=0.0, passenger=0.0, charge=0.0, queue=0.0
    )
    hourly = [
        dict(requests=0, completed=0, rejected=0, service=0.0, cents=0, waits=[])
        for _ in range(hours)
    ]
    waits = []
    completed = rejected = revenue = 0

    def push(time, priority, kind, vehicle=-1, payload=None):
        heapq.heappush(events, (time, priority, next(sequence), kind, vehicle, payload))

    def distance(p, q):
        return math.dist(p, q) * a.road_distance_multiplier

    def duration(miles):
        return miles / a.average_speed_mph * 60

    def interval(start, end, kind):
        stop = min(end, horizon)
        if stop <= start:
            return
        elapsed = stop - start
        totals[kind] += elapsed
        if kind == "service":
            for h in range(int(start // 60), min(hours, math.ceil(stop / 60))):
                hourly[h]["service"] += max(
                    0, min(stop, (h + 1) * 60) - max(start, h * 60)
                )

    def travel(vehicle, start, miles, kind):
        nonlocal minimum_battery
        end = start + duration(miles)
        fraction = (
            min(1.0, max(0.0, (horizon - start) / (end - start)))
            if end > start
            else 1.0
        )
        totals[kind] += miles * fraction
        vehicle.battery -= miles
        minimum_battery = min(minimum_battery, vehicle.battery)
        if vehicle.battery < a.reserve_fraction * a.battery_range_miles - 1e-8:
            raise AssertionError("Battery reserve violated")
        return end

    def start_charge(now, index):
        nonlocal active_chargers, max_chargers
        vehicle = fleet[index]
        interval(vehicle.queued_at, now, "queue")
        vehicle.state = "CHARGING"
        active_chargers += 1
        max_chargers = max(max_chargers, active_chargers)
        assert active_chargers <= a.charger_count
        target = a.charge_target_fraction * a.battery_range_miles
        end = now + max(0, target - vehicle.battery) / a.charge_range_miles_per_minute
        interval(now, end, "charge")
        push(end, 0, "charged", index)

    def to_depot(now, index):
        vehicle = fleet[index]
        assert vehicle.state == "IDLE"
        vehicle.state = "DEPOT_TRAVEL"
        end = travel(vehicle, now, distance(vehicle.position, (0.0, 0.0)), "empty")
        push(end, 0, "depot", index)

    for ride in rides:
        push(ride.time, 1, "request", payload=ride)
    while events:
        now, _, _, kind, index, payload = heapq.heappop(events)
        if now >= horizon:
            break
        if kind == "request":
            ride = payload
            h = hourly[int(now // 60)]
            h["requests"] += 1
            passenger_miles = distance(ride.origin, ride.destination)
            feasible = []
            for i, vehicle in enumerate(fleet):
                if vehicle.state != "IDLE":
                    continue
                pickup = distance(vehicle.position, ride.origin)
                needed = (
                    pickup
                    + passenger_miles
                    + distance(ride.destination, (0.0, 0.0))
                    + a.reserve_fraction * a.battery_range_miles
                )
                if vehicle.battery + 1e-9 < needed:
                    if (
                        vehicle.battery
                        < a.charge_target_fraction * a.battery_range_miles
                    ):
                        to_depot(now, i)
                    continue
                if duration(pickup) <= a.max_pickup_wait_minutes:
                    feasible.append((pickup, i))
            if not feasible:
                rejected += 1
                h["rejected"] += 1
                continue
            pickup, index = min(feasible)
            vehicle = fleet[index]
            assert vehicle.state == "IDLE"
            vehicle.state = "PICKUP_TRAVEL"
            arrived = travel(vehicle, now, pickup, "empty")
            departure = arrived + a.pickup_dwell_minutes
            interval(now, departure, "service")
            push(departure, 0, "pickup", index, (ride, arrived - now, passenger_miles))
        elif kind == "pickup":
            ride, wait, miles = payload
            vehicle = fleet[index]
            assert vehicle.state == "PICKUP_TRAVEL"
            vehicle.state = "PASSENGER_TRAVEL"
            end = travel(vehicle, now, miles, "paid") + a.dropoff_dwell_minutes
            interval(now, end, "service")
            interval(now, end, "passenger")
            push(end, 0, "dropoff", index, (ride, wait, miles))
        elif kind == "dropoff":
            ride, wait, miles = payload
            vehicle = fleet[index]
            vehicle.position = ride.destination
            vehicle.state = "IDLE"
            completed += 1
            waits.append(wait)
            cents = fare_cents(request, miles, duration(miles))
            revenue += cents
            h = hourly[int(now // 60)]
            h["completed"] += 1
            h["cents"] += cents
            h["waits"].append(wait)
            if vehicle.battery <= a.charge_trigger_fraction * a.battery_range_miles:
                to_depot(now, index)
        elif kind == "depot":
            vehicle = fleet[index]
            vehicle.position = (0.0, 0.0)
            vehicle.state = "CHARGING_QUEUE"
            vehicle.queued_at = now
            if active_chargers < a.charger_count:
                start_charge(now, index)
            else:
                queue.append(index)
        elif kind == "charged":
            vehicle = fleet[index]
            vehicle.battery = a.charge_target_fraction * a.battery_range_miles
            vehicle.state = "IDLE"
            active_chargers -= 1
            if queue:
                start_charge(now, queue.popleft())
    for index in queue:
        interval(fleet[index].queued_at, horizon, "queue")
    total_miles = totals["paid"] + totals["empty"]
    denominator = request.fleet_size * horizon
    metrics = SimulationMetrics(
        total_requests=len(rides),
        rides_completed=completed,
        rejected_requests=rejected,
        unfinished_requests=len(rides) - completed - rejected,
        average_wait_minutes=float(np.mean(waits)) if waits else None,
        p95_wait_minutes=float(np.quantile(waits, 0.95, method="linear"))
        if waits
        else None,
        utilization_pct=min(100.0, totals["service"] / denominator * 100),
        passenger_utilization_pct=min(100.0, totals["passenger"] / denominator * 100),
        paid_miles=totals["paid"],
        empty_miles=totals["empty"],
        empty_mile_pct=totals["empty"] / total_miles * 100 if total_miles else None,
        charging_vehicle_hours=totals["charge"] / 60,
        charging_queue_vehicle_hours=totals["queue"] / 60,
        gross_revenue_usd=revenue / 100,
        revenue_per_vehicle_usd=revenue / 100 / request.fleet_size,
        rides_per_vehicle=completed / request.fleet_size,
    )
    if audit is not None:
        audit.update(
            max_chargers=max_chargers,
            minimum_battery=minimum_battery,
            states=[v.state for v in fleet],
        )
    simulation_versions = versions.model_copy(update={"model_version": "simulation.v1"})
    return SimulationResult(
        versions=simulation_versions,
        simulation_id=digest(
            {
                "versions": simulation_versions.model_dump(),
                "request": request.model_dump(),
                "assumptions": a.model_dump(),
            }
        ),
        request=request,
        assumptions=a,
        metrics=metrics,
        hourly=[
            HourlyMetrics(
                hour=i,
                requests=h["requests"],
                completed_rides=h["completed"],
                rejected_requests=h["rejected"],
                average_wait_minutes=float(np.mean(h["waits"])) if h["waits"] else None,
                utilization_pct=min(
                    100.0, h["service"] / (60 * request.fleet_size) * 100
                ),
                gross_revenue_usd=h["cents"] / 100,
            )
            for i, h in enumerate(hourly)
        ],
        warnings=[
            "Hypothetical fleet operations, not autonomous driving.",
            "Demand is assumed: same baseline across metros; no observed local ride-hailing demand.",
            "Synthetic service zone; no street routing. No passenger queue; immediate assignment policy.",
            "Gross revenue excludes all operating costs and is not profit. Wait metrics cover completed rides only.",
            "Passenger miles include unfinished trips within the window; revenue is recognized only at completed dropoff.",
            "Charging uses an assumed private depot, not measured public charging capacity.",
        ],
    )
