# ODD Scout Project Roadmap

Last updated: 2026-09-26

Use this file as the project checklist. Check an item only after recording its proof. Keep mock and verified releases separate. Do not claim production readiness until a verified release is selected and validated. Keep P1 and P2 work behind the P0 gates.

## Current snapshot

- Developer 1 verified release: not published. Census access, official ingestion, harmonization, and reference evidence remain open.
- Developer 2 contracts and engine: `uv run pytest` passed 45 tests on 2026-09-26 with the new startup test. GitHub Actions run #23 passed on PR commit `9674d85`, including this test.
- Developer 2 mock deployment: closed for the hackathon demo. Render service `srv-dartlbm0tbcc73d0lmug` runs deployment `dep-darv61avcj2c73acjng0`, commit `329076b`, release `mock.v1`. Owner accepts warm simulation latency above two seconds; this does not pass the original target.
- Developer 3 connected demo: local flow and browser proof exist. Hosted frontend, exact CORS origin, and deployed rehearsal remain open.

## P0 roadmap

### Developer 1 — Publish first verified release

Paths: `data/`, `packages/ranking/`, ranking/reference configuration, ranking tests, and `docs/data-sources.md`.

- [ ] Obtain Census API access through the approved local setup. Never put the key in chat, fixtures, manifests, or commits.
- [ ] Ingest official 2024 ACS five-year estimates and matching CBSA/county geography.
- [ ] Ingest NOAA 1991–2020 station normals; record scale, quality flags, and station distances.
- [ ] Collect an operational public AFDC charging snapshot; deduplicate ports and validate status and counts.
- [ ] Record dated public evidence for eligible commercial reference markets.
- [ ] Harmonize sources to one frozen geographic vintage; keep raw snapshots immutable and source hashes recorded.
- [ ] Publish an immutable, provenance-complete release with at least eight fully measured candidate metros, frozen normalization bounds, and eligible commercial references.
- [ ] Keep incomplete candidates visibly unranked. Do not promote synthetic measurements.
- [ ] Verify joins, ACS denominators and margins of error, NOAA transformations, AFDC deduplication, reference dates, candidate completeness, publisher behavior, and verified-startup behavior.
- [ ] Run ranking tests and record the release ID and proof in `docs/data-sources.md`.

### Developer 2 — Keep contracts and engine gates green

Paths: `backend/`, `packages/contracts/`, `tests/contracts/`, `tests/simulation/`, CI, `Dockerfile`, `render.yaml`, `docs/contracts.md`, and `docs/simulation.md`.

- [x] Load and validate the selected release. Reject release/mode mismatch instead of silently falling back to mock.
- [x] Serve versioned API routes with bounded requests, standard error shapes, and provenance.
- [x] Keep simulation deterministic and bounded. Preserve request conservation, battery reserve, finite charger capacity, cutoff accounting, and fare rounding.
- [x] Run `uv run pytest tests/contracts tests/simulation`: 21 passed on 2026-09-26.
- [x] Run `uv run python -m contracts.export` and regenerate TypeScript with `npm --prefix apps/web run generate:api`; generated files show no drift.
- [x] Run `npm --prefix apps/web run typecheck`.
- [x] Test mock/verified separation and verified startup candidate threshold. Threshold test rejects seven ranked candidates and accepts eight without fabricating verified measurements.
- [x] Run `uv run pytest` after updating from `main`: 45 passed on 2026-09-26. An earlier local full CI run passed 30 tests, OpenAPI and TypeScript generation with no drift, frontend typecheck and build, and Playwright E2E (2 passed).
- [x] GitHub Actions run #23 passed on PR commit `9674d85`, including the startup test.
- [ ] Validate startup against Developer 1’s real verified release when available. No verified release exists yet.
- [ ] Validate production CORS with Developer 3’s exact hosted origin when available.

### Developer 2 — Deploy backend and measure it

Paths: deployment files and necessary backend configuration only.

- [x] Keep Render mock service reachable at `/health`; record service, deployment, commit, and release IDs.
- [x] Smoke-test health, config, city list/detail, rankings, explanations, and simulations.
- [x] Measure the default seven-day simulation. Latest three warm calls took 2.578, 2.659, and 2.095 seconds; each returned the same simulation ID and conserved 6,941 requests: 6,802 completed, 133 rejected, and 6 unfinished.
- [x] Record owner acceptance of latency above two seconds for the hackathon mock demo. Do not claim the original two-second target passed.
- [x] Preserve prior smoke-checked deployment `dep-darunmg473hc73fbpsdg` (commit `23679e6`) in Render deployment history as rollback target. No rollback was performed.
- [x] Keep local HTTP mode as fallback.
- [ ] Select a verified release only after Developer 1 publishes and startup validation passes. Keep mock label visible until then.

### Developer 3 — Finish and rehearse connected demo

Paths: `apps/web/`, browser tests, and `docs/demo-runbook.md`.

- [x] Build local market explorer and scenario flow with ranking controls, factor/source details, explanations, simulation results, charts, and playback.
- [x] Verify local desktop/mobile flow, evidence drawer, changed inputs, fare behavior, playback, and stale-request cancellation.
- [ ] Deploy frontend to Vercel and configure `NEXT_PUBLIC_API_BASE_URL` plus HTTP data transport.
- [ ] Set Render `ODD_ALLOWED_ORIGINS` to the exact Vercel origin.
- [ ] Rehearse hosted flow at desktop and mobile sizes against the Render backend.
- [ ] Confirm visible mock/verified labels, source links, loading/errors, changed weights and scenario inputs, cancellation of stale requests, and graceful API errors.
- [ ] Record deployed rehearsal results in `docs/demo-runbook.md`.

## Shared integration sequence

- [ ] Review the clean `main` scaffold and current contracts across all three owners.
- [ ] Publish Developer 1’s verified release while Developers 2 and 3 keep mock integration working.
- [ ] Have Developer 2 validate the verified release at startup and deploy it. Have Developer 3 use the backend URL and rehearse the hosted flow.
- [ ] For each shared contract or release change, review affected consumers, regenerate artifacts, update fixtures, and rerun relevant gates.
- [ ] Freeze the verified release; rehearse rollback and local fallback; capture the final demo result.

## Integration gates

- [x] Local contracts, fixtures, startup behavior, and ownership agree for mock mode.
- [x] Twenty mock markets work through HTTP; ranking, explanation, and simulation endpoints return results.
- [x] Ranking and seeded simulation tests pass; the UI consumes engine results.
- [ ] Replace mock ranking data with eight verified candidates and reference evidence.
- [ ] Complete hosted frontend, visual flow, error handling, and hosted rehearsal. The project owner accepts current warm simulation latency for this hackathon demo; the two-second target remains unmet.
- [ ] Freeze the verified release and rehearse rollback and local fallback.

## P1 and P2 backlog

### Developer 1

- [ ] P1: Expand verified coverage toward twenty metros; document exclusions and uncertainty.
- [ ] P1: Add road and intersection features only after checking coverage and geography joins. Version any scoring change and coordinate frontend impacts.
- [ ] P1: Add reference-category selection and deterministic weight-sensitivity comparisons.
- [ ] P1: Add crash context only as unscored public context after validating source and denominators. Exclude it from safety/readiness claims.
- [ ] P2: Evaluate airport activity and severe-weather features. Add only when source coverage and geographic assignment are defensible.

### Developer 2

- [ ] P1: Add guarded live explanation service after P0. Own server-side credentials, request limits, evidence validation, caching, and deterministic template fallback.
- [ ] P1: Coordinate accepted explanation fields with Developer 3. Pass calculated structured evidence only; never allow model output to set ranks, facts, or simulation results.
- [ ] P1: Add battery, charging, or speed controls only if approved as a separate slice; keep assumptions explicit and seeded results reproducible.

### Developer 3

- [ ] P1: Add comparison UX for reference categories, weight sensitivity, baseline/scenario comparisons, uncertainty, and additional verified cities after API fields are agreed.
- [ ] P1: Integrate live analyst wording only after Developer 2 ships the guarded endpoint. Render numeric scores from deterministic API results, cite evidence IDs, and show template text on service failure.
- [ ] P2: Consider lightweight illustrative map motion only after hosted P0 is reliable. Label it illustrative; never use it to calculate fleet metrics.

## Scope boundaries

- Developer 1 does not own frontend, API, or simulation code and does not change scoring without documenting model version and coordinating effects.
- Developer 2 does not own frontend design or independent ranking-method changes. Coordinate shared contract changes and regenerate TypeScript.
- Developer 3 does not own data acquisition, ranking calculations, or simulation calculations. Do not reconstruct scores or trips in React.
- Excluded: driving physics or perception, safety certification, private operator algorithms, advanced ML, dynamic pricing, real customer data, billing, databases, queues, and Kubernetes.
