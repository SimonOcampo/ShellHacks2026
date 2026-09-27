# Architecture

One monorepo, one Next.js frontend, one FastAPI service, and immutable release files. No database, task queue, runtime ingestion, or LLM dependency in P0.

```text
Official snapshots + manifests
  -> offline source adapters and geographic harmonization
  -> validated standardized CityFeature release
  -> frozen normalization and reference selection
  -> deterministic ranking and evidence

Scenario request + explicit assumptions + seed
  -> request generation
  -> discrete fleet events
  -> window-limited accounting and hourly results

FastAPI contracts -> generated TypeScript -> dashboard
Server-calculated ranking evidence -> deterministic explanation template -> optional evidence-grounded Gemini analyst wording
```

`packages/contracts` is canonical. `packages/ranking/odd_ranking` has no HTTP or source-column dependencies. `backend/odd_scout/simulation` owns operational state and accounting. `data/adapters` owns external column names and source transforms. The frontend only renders returned calculations.

Each release carries mode, schema, data, and model identifiers. Backend startup refuses mode/release mismatches. Verified startup additionally requires eight ranked candidates. Selecting mock is an explicit environment choice, never an automatic fallback after an ingestion error.

The frontend cancels superseded requests and checks abort state before applying results. Previous simulation results remain displayed with a recalculation indicator. Simulation concurrency is bounded to two synchronous requests per process. Deployment uses one process by default.

The optional analyst chat sends server-calculated ranking evidence and selected-city provenance to Gemini. Its server-side key is never exposed to the frontend. Responses cite only evidence IDs supplied by the backend; invalid model output falls back to the deterministic explanation. The model cannot set scores or simulation results.

## Geography

Rank fixed Census CBSA metros. Census data and county aggregation fit regional market screening better than city-proper boundaries. City boundaries are smaller for road extraction but omit regional travel. Both still require weather proxies and source-specific joins.

Production releases must pin the geographic vintage matching ACS 2024 five-year data. Charging points require a documented spatial join. County data uses a frozen CBSA crosswalk. Weather uses nearby station proxies. Multi-state legal evidence stays jurisdiction-specific.

Simulation uses a hypothetical five-mile-radius disk, not the metro boundary. Public map markers only identify principal city locations. No service coverage is asserted.

## Ownership and compatibility

Developer 1 owns data, ranking, and ranking/reference configuration. Developer 2 owns API, contracts, simulation, and deployment. Developer 3 owns UI and explanation UX. Shared contract changes require affected owners.

Keep `/api/v1` backwards compatible for deployed clients. Add optional input fields with defaults and regenerate types before migrating consumers. Breaking changes require a new API version and coordinated rollout. Releases are immutable; rollback selects the previous release and backend/frontend deployment. No destructive contraction is implemented.
