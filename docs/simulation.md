# Fleet simulation v1

This models hypothetical fleet operations, not driving intelligence. No perception, routing on real streets, vehicle physics, lane changes, or safety evaluation.

## Lifecycle and policy

Heap events ordered by time, priority, and event ID. Completion events release vehicles/chargers before same-time requests. States: IDLE, PICKUP_TRAVEL, PASSENGER_TRAVEL, DEPOT_TRAVEL, CHARGING_QUEUE, CHARGING.

Generate Poisson hourly requests. Draw times uniformly in each hour and origins/destinations uniformly by area in a five-mile disk. Separate seed streams preserve identical requests when fleet or pricing changes.

Assign nearest idle feasible vehicle, breaking distance ties by vehicle index. Require pickup <=15 minutes and enough battery for pickup, passenger trip, depot return, and reserve. No passenger queue: reject immediately when no vehicle qualifies. An energy-short idle vehicle may head to charge. After dropoff, charge at the trigger threshold; otherwise idle at destination.

Depot charging has a finite FIFO queue. No repositioning optimizer.

## Assumptions

Configuration lives in `config/simulation.v1.json`. Defaults: 1,000 assumed requests/day, 50 vehicles, seven repeated synthetic days starting Monday, 20 mph, Euclidean distance times 1.3, one-minute pickup and dropoff dwell.

Range 250 miles; start full; reserve 10%; trigger 20%; target 80%; replenish 2.5 range-miles/minute. Chargers are `ceil(fleet/10)`, minimum one. This private depot assumption is independent of public charging features.

Demand profile has 24 documented relative weights repeated daily. No local calibration, weekday/weekend variation, price elasticity, traffic, weather effects, or battery degradation. Same city-independent baseline supports comparable assumptions, not demand forecasts.

## Metrics

`requests = completed + rejected + unfinished` at the end of the window. Events after cutoff are not completed. Distance and state durations are clipped at cutoff.

- Wait: request to vehicle arrival, completed rides only. p95 uses linear quantile interpolation. No completed rides gives null.
- Utilization: pickup travel/dwell plus passenger travel/dropoff dwell divided by fleet elapsed time.
- Passenger utilization: passenger travel/dropoff dwell only.
- Passenger miles (`paid_miles`): actual in-window passenger travel, including unfinished rides.
- Empty miles: pickup and depot travel. Zero total distance gives null empty share.
- Charging and queue time: summed vehicle-hours; distinct from wall time.
- Revenue: recognized only at completed dropoff; base fare + passenger miles rate + passenger travel-minute rate, excluding dwell. Per-fare half-up cent rounding; integer-cent aggregation.
- Revenue/vehicle and rides/vehicle: totals divided by fleet size.

Hourly requests use request time. Hourly completions, revenue, and mean wait use dropoff time. Hourly service time is split across hour boundaries, so its average reconciles to fleet utilization.

Gross revenue excludes all costs, tax, tips, insurance, maintenance, remote assistance, and permits. It is not profit.

## Limits and replay

Fleet 1–200, days 1–7, demand multiplier 0–5, seed unsigned 32-bit, bounded fares with at most two decimal places. Refuse more than 100,000 generated requests; never truncate. API permits two concurrent simulations per process.

Version, resolved request, assumptions, and any selected demand artifact determine simulation identity. The UI clock renders optional vehicle segments and selects the corresponding hourly aggregates. No operational decisions are calculated in the renderer.

## Providence public spatial proxy

The optional `providence-rism-2015.v1` demand profile is available only for `cbsa:39300` when that city is present in the selected release. It uses 86 Providence high-employment transportation analysis zones from the Rhode Island Statewide Model's public 2015 trip-production and trip-attraction layer. The immutable, hash-pinned [profile artifact](../data/releases/simulation/providence-rism-2015.v1.json) records the official URL, raw SHA-256, transformation, period, and 13.690061 square miles of included zones. The source is a public model output, not observed ride-hail or Waymo trip records. Other Providence areas and the wider Providence-Warwick CBSA are outside this layer.

The Poisson request total, 1,000 requests/day baseline, 24 hourly weights, seven repeated days, fares, dispatch, travel speed, and charging assumptions remain those of simulation v1. The new profile changes pickup and dropoff location selection: zone production estimates weight pickups; attraction estimates weight dropoffs. Each selected zone supplies one of 32 reproducible points inside its polygon. These points are illustrative, not observed ride locations. A fixed seed reproduces the same requests. The default `synthetic-zone.v1` profile retains its prior behavior and simulation ID.

Select the public spatial proxy through the existing endpoint after starting with a release containing Providence, such as `verified.v2`:

```json
{
  "city_id": "cbsa:39300",
  "days": 7,
  "fleet_size": 50,
  "seed": 42,
  "demand_profile_id": "providence-rism-2015.v1",
  "include_playback": true
}
```

`demand_source` reports the selected source and its limits. `include_playback` adds timestamped vehicle segments generated by the same event queue as the metrics. States include `IDLE`, `PICKUP_TRAVEL`, `PICKUP_DWELL`, `PASSENGER_TRAVEL`, `DROPOFF_DWELL`, `DEPOT_TRAVEL`, `CHARGING_QUEUE`, and `CHARGING`; `occupied` identifies passenger segments. Segment times are minutes from simulation start. A segment linearly interpolates between its two local-mile endpoints over its time interval. The profile's geographic origin and miles-per-degree values can place those endpoints on a Providence map. These straight lines are illustrative and are not street routes. The assumed depot is at the coordinate origin, not a documented facility.

The playback payload is optional and limited to runs of 10,000 requests or fewer. Larger runs can still return metrics without playback. The UI must render returned segments as hypothetical movement; it must not convert this profile into a claim about actual Waymo vehicles or citywide ride demand.

## Mapbox 3D playback

HTTP scenarios request vehicle playback. Providence automatically selects the pinned RISM public spatial proxy; other cities retain synthetic local coordinates and use the local-coordinate view without placing an invented service area on a city map. Fixture mode keeps its historical metrics and explicitly reports missing playback.

The browser indexes returned segments by vehicle, binary-searches the current interval, and interpolates only that interval's endpoints. One simulation-minute clock drives vehicles, the selected hourly chart marker, and the inspector. Play, pause, minute seeking, replay at the horizon, and 1/10/60 simulated minutes per second are supported. Hidden tabs and reduced-motion preferences stop automatic movement. Recalculation pauses playback and only the newest request can replace the scene.

Mapbox GL JS v3.30.0 renders the geographic frame, street basemap, and available building footprints/heights using fill-extrusion layers. The initial view fits the Providence area; Downtown 3D and the selected-vehicle camera expose neighborhood details. Cars use two extruded polygons for a body and cabin, enlarged to 12 meters for readability; they are generic symbols, not branded Waymo models. Overview dots remain visible at smaller zoom levels. This is a current Mapbox basemap, not a reconstruction of Providence in 2015. No routing, collision avoidance, signal timing, terrain model, photogrammetry, or lane-level fidelity is claimed.

All eight engine states have distinct labels and colors: idle, empty travel to pickup, pickup dwell, occupied travel, dropoff dwell, empty travel to depot, charging queue, and charging. A vehicle selector exposes the exact state, occupancy, and segment interval and highlights its straight-line leg. The source panel links the public model and displays limitations.

Without a Mapbox token or when map loading fails, the same engine coordinates render in an explicitly labeled local-mile plot. The fallback does not invent streets. Runs above the 10,000-request playback cap retry with the same inputs and seed for metrics only, accompanied by a visible notice. Neither the API trace nor the UI silently truncates the fleet.

Renderer references: [Mapbox 3D buildings](https://docs.mapbox.com/mapbox-gl-js/example/3d-buildings/) and [GeoJSON polygon extrusion](https://docs.mapbox.com/mapbox-gl-js/example/3d-extrusion-floorplan/).
