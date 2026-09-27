# Architecture

One monorepo, one Next.js frontend, one FastAPI service, and immutable release files. No database, task queue, runtime ingestion, or LLM dependency in P0.

```text
Official snapshots + manifests
  -> offline source adapters and geographic harmonization
  -> validated standardized CityFeature release
  -> frozen normalization and reference selection
  -> deterministic ranking and evidence

Scenario request + explicit assumptions + seed + optional pinned spatial profile
  -> seeded request generation
  -> discrete fleet events
  -> window-limited accounting, hourly results, optional vehicle segments

FastAPI contracts -> generated TypeScript -> dashboard
Server-calculated ranking evidence -> deterministic explanation template
```

`packages/contracts` is canonical. `packages/ranking/odd_ranking` has no HTTP or source-column dependencies. `backend/odd_scout/simulation` owns operational state and accounting. `data/adapters` owns external column names and source transforms. The frontend only renders returned calculations.

Each release carries mode, schema, data, and model identifiers. Backend startup refuses mode/release mismatches. Verified startup additionally requires eight ranked candidates. Selecting mock is an explicit environment choice, never an automatic fallback after an ingestion error.

The frontend cancels superseded requests and checks abort state before applying results. Previous simulation results remain displayed with a recalculation indicator. Simulation concurrency is bounded to two synchronous requests per process. Deployment uses one process by default.

## Geography

Rank fixed Census CBSA metros. Census data and county aggregation fit regional market screening better than city-proper boundaries. City boundaries are smaller for road extraction but omit regional travel. Both still require weather proxies and source-specific joins.

Production releases must pin the geographic vintage matching ACS 2024 five-year data. Charging points require a documented spatial join. County data uses a frozen CBSA crosswalk. Weather uses nearby station proxies. Multi-state legal evidence stays jurisdiction-specific.

The default simulation uses a hypothetical five-mile-radius disk, not the metro boundary. The optional Providence profile selects representative points inside published Rhode Island Statewide Model high-employment zones. It covers part of Providence municipality, not the whole metro, and still uses assumed request timing and straight-line travel. Public map markers only identify principal city locations. No service coverage is asserted.

## Ownership and compatibility

Developer 1 owns data, ranking, and ranking/reference configuration. Developer 2 owns API, contracts, simulation, and deployment. Developer 3 owns UI and explanation UX. Shared contract changes require affected owners.

Keep `/api/v1` backwards compatible for deployed clients. Add optional input fields with defaults and regenerate types before migrating consumers. Breaking changes require a new API version and coordinated rollout. Releases are immutable; rollback selects the previous release and backend/frontend deployment. No destructive contraction is implemented.

## Vehicle playback renderer

The Python event queue remains the sole simulation engine. The frontend requests its trace, indexes segments by vehicle, and renders positions from the supplied timing and endpoints. For Providence, the browser displays each moving vehicle along a shortest path over published road centerlines while preserving the engine's segment start and end times. Mapbox GL JS handles the city basemap and 3D buildings; it does not dispatch vehicles or recalculate operational metrics. One playback clock controls both the fleet scene and hourly metric selection. Unanchored synthetic profiles use local coordinates, while the pinned Providence profile provides the geographic frame. Historical fixtures have no vehicle trace. See `docs/simulation.md` for source limitations, capacity fallback, and controls.
