# ODD Scout Project Roadmap

Last updated: 2026-09-26

Use this file as the project checklist. Check an item only after recording its proof. Keep mock and verified releases separate. Do not claim production readiness until a verified release is selected and validated. Keep P1 and P2 work behind the P0 gates.

## Current snapshot

- Developer 1 release artifact: `verified.v2` corrects the commute denominator, uses one ACS method with both input MOEs for all 35 metros, and corrects AFDC provenance URLs. All 20 candidates rank against 15 references. Fresh correction checks and inherited source evidence are recorded in `data/audits/verified.v2-source-checks.json`. Full raw-bundle replay is outside the acceptance scope; it is not required for this release.
- Developer 2 contracts and engine: `uv run pytest` passed 45 tests on 2026-09-26 with the new startup test. GitHub Actions run #23 passed on PR commit `9674d85`, including this test.
- Developer 2 verified deployment: Render service `srv-dartlbm0tbcc73d0lmug` serves `verified.v2` at `https://odd-scout-api.onrender.com`, deployment `dep-das4jcnpn0mc73eq63d0`, commit `5d87986`. All seven API routes passed hosted checks. Three warm default simulations took 2.708, 2.947, and 2.866 seconds. This latency is accepted for the hackathon demo; no two-second performance gate applies.
- Developer 3 connected demo: Vercel production deployment `CyDER2SMieZuNoGuXRvb8SpG2R8Q` serves `https://odd-scout-web.vercel.app` with the Render API URL and HTTP transport. Exact-origin CORS, desktop flow, rollback, and local HTTP fallback passed. Mobile demo is not a P0 gate.

## P0 roadmap

### Developer 1 — Publish first verified release

Paths: `data/`, `packages/ranking/`, ranking/reference configuration, ranking tests, and `docs/data-sources.md`.

- [x] Use the keyless Census Summary File path for official ACS acquisition. A Census API key is optional and must never enter chat, fixtures, manifests, or commits. Proof: `data/src/datasets/acs/summary_file.py` and the 2024 ACS entries in `data/data/processed/manifests/data_manifest.json`.
- [x] Ingest official 2024 ACS five-year estimates and matching 2024 CBSA/county geography. Proof: 35 records in `data/data/processed/cities/all_city_features.json` and TIGER/ACS entries in the data manifest.
- [x] Ingest NOAA 1991–2020 station normals and record station IDs, distances, source hashes, and unit conversions. Proof: `data/src/datasets/noaa/` and NOAA provenance in processed city records.
- [x] Finish NOAA source validation. Inherited proof for unchanged measurements: the hash-matched `verified.v1` audit verifies 175 observations, published units and flags, and 105 city-feature station selections. Lower-completeness flags remain documented limitations.
- [x] Collect an operational public AFDC charging snapshot and filter public, operational DC sites. Proof: AFDC entry in the data manifest and `data/src/datasets/afdc/process.py`.
- [x] Deduplicate AFDC station IDs and independently validate port counts and geographic assignments. Inherited proof: the parent audit verifies 4,182 joined sites and 24,739 ports. The adapter rejects conflicting duplicate IDs; `verified.v2` corrects provenance URLs without changing measurements.
- [x] Record dated public evidence for commercial reference markets. Proof: 15 Waymo records and source provenance in `data/data/processed/reference_markets/`; all 15 references have complete measurements in `verified.v2`.
- [x] Join processed sources to 2024 CBSA/county geography and record source hashes without overwriting raw snapshots. Proof: data manifest, processed city provenance, and `data/tests/test_city_features.py`. NOAA normals retain their distinct 1991–2020 climate period.
- [x] Publish an immutable release with at least eight fully measured candidate metros, frozen normalization bounds, and eligible references. `verified.v2` contains 20 complete candidates, 15 enabled references, a 35-city frozen cohort, and source hashes resolved through the parent manifest plus the correction audit. Deployment proof is recorded in `docs/verification.md`.
- [x] Keep incomplete candidates unranked and reject synthetic evidence in verified releases. Proof: `packages/ranking/odd_ranking/engine.py`, `packages/contracts/models.py`, `data/src/pipeline/export_release.py`, and ranking tests.
- [x] Add focused tests for geography joins, ACS denominators, NOAA transformations, reference status, missing measurements, and publisher behavior. Proof: `data/tests/` and `tests/ranking/`.
- [x] Complete incremental source and release verification. All 35 commutes have fresh estimate/MOE checks; unchanged sources reuse the exact parent audit. Local verified startup and all seven API checks pass. With declared data dependencies, 78 tests pass and two optional tests skip. Full raw-bundle replay is not required; acceptance relies on fresh correction checks and hash-matched inherited source evidence. No full-replay result is claimed.
- [x] Run ranking tests. `uv run pytest tests/ranking -q`: 21 passed on 2026-09-26.
- [x] Record `verified.v2`, its SHA-256, ranking ID, verification scope, and publication proof in `docs/data-sources.md`.

### Developer 2 — Keep contracts and engine gates green

Paths: `backend/`, `packages/contracts/`, `tests/contracts/`, `tests/simulation/`, CI, `Dockerfile`, `render.yaml`, `docs/contracts.md`, and `docs/simulation.md`.

- [x] Load and validate the selected release. Reject release/mode mismatch instead of silently falling back to mock.
- [x] Serve versioned API routes with bounded requests, standard error shapes, and provenance.
- [x] Keep simulation deterministic and bounded. Preserve request conservation, battery reserve, finite charger capacity, cutoff accounting, and fare rounding.
- [x] Run `uv run pytest tests/contracts tests/simulation`: 21 passed on 2026-09-26.
- [x] Run `uv run python -m contracts.export` and regenerate TypeScript with `npm --prefix apps/web run generate:api`; generated files show no drift.
- [x] Run `npm --prefix apps/web run typecheck`.
- [x] Test mock/verified separation and verified startup candidate threshold. Threshold test rejects seven ranked candidates and accepts eight without fabricating verified measurements.
- [x] Run `uv run pytest` on `main` commit `5d87986`: 45 passed on 2026-09-26. GitHub Actions P0 acceptance run `36276939150` passed on the same commit.
- [x] GitHub Actions run #23 passed on PR commit `9674d85`, including the startup test.
- [x] Validate startup against Developer 1’s committed `verified.v1` release. On 2026-09-26, the actual FastAPI lifespan loaded the release and seven local API checks passed: health, config, city list/detail, rankings, explanation, and a default seven-day simulation. All 20 candidates ranked against 15 references. Explicit mock fallback also passed. Proof and release hash: `docs/verification.md`. This validates backend compatibility, not source-publication signoff.
- [x] Validate production CORS with Developer 3’s exact hosted origin. Render deployment `dep-das5lpu0tbcc73dudkc0` serves `ODD_ALLOWED_ORIGINS` including `https://odd-scout-web.vercel.app`; API GET and OPTIONS preflight return HTTP 200 with the expected allow-origin header.

### Developer 2 — Deploy backend and measure it

Paths: deployment files and necessary backend configuration only.

- [x] Keep Render mock service reachable at `/health`; record service, deployment, commit, and release IDs.
- [x] Smoke-test health, config, city list/detail, rankings, explanations, and simulations.
- [x] Measure the default seven-day simulation. Latest three warm calls took 2.578, 2.659, and 2.095 seconds; each returned the same simulation ID and conserved 6,941 requests: 6,802 completed, 133 rejected, and 6 unfinished.
- [x] Accept measured warm simulation latency above two seconds for the hackathon demo. No two-second performance target remains.
- [x] Preserve prior smoke-checked deployment `dep-darunmg473hc73fbpsdg` (commit `23679e6`) in Render deployment history as rollback target. No rollback was performed.
- [x] Keep local HTTP mode as fallback.
- [x] Select `verified.v2` on Render, run all seven hosted API checks, and record deployment and rollback identifiers. Deployment `dep-das4jcnpn0mc73eq63d0` runs commit `5d87986`; prior smoke-checked deployment `dep-das4ir0u01pc73ensm50` remains in history. No rollback was performed. Three warm default simulations returned the same ID and conserved 6,941 requests. Latency is informational; no two-second performance gate applies.

### Developer 3 — Finish and rehearse connected demo

Paths: `apps/web/`, browser tests, and `docs/demo-runbook.md`.

- [x] Build local market explorer and scenario flow with ranking controls, factor/source details, explanations, simulation results, charts, and playback.
- [x] Verify local desktop/mobile flow, evidence drawer, changed inputs, fare behavior, playback, and stale-request cancellation.
- [x] Deploy frontend to Vercel and configure `NEXT_PUBLIC_API_BASE_URL=https://odd-scout-api.onrender.com` plus `NEXT_PUBLIC_DATA_TRANSPORT=http`. Current production deployment `CyDER2SMieZuNoGuXRvb8SpG2R8Q` is ready at `https://odd-scout-web.vercel.app`.
- [x] Set Render `ODD_ALLOWED_ORIGINS` to include the exact Vercel production origin while preserving localhost origins.
- [x] Rehearse hosted flow at desktop size against the Render backend. A mobile demo is not required.
- [x] Confirm verified release/provenance, source links, loading states, changed weights and scenario inputs. Local API outage/retry recovered; superseded ranking response test passed.
- [x] Record deployed rehearsal results in `docs/demo-runbook.md`.

## Shared integration sequence

- [x] Review the integrated `main` scaffold and current contracts across owners. Verified release, FastAPI responses, generated API types, and hosted frontend agree; proof is in `docs/verification.md`.
- [x] Publish Developer 1’s corrected release artifact while Developers 2 and 3 keep integration working. `verified.v2` has source-correction and hosted API proof.
- [x] Have Developer 2 validate and deploy the verified release, then have Developer 3 rehearse the hosted flow at desktop size. Results are in `docs/demo-runbook.md` and `docs/verification.md`.
- [x] Review affected consumers for the verified release change; API schema and generated types did not change, and relevant gates passed.
- [x] Freeze the verified release; rehearse rollback and local fallback; capture the final demo result.

## Integration gates

- [x] Local contracts, fixtures, startup behavior, and ownership agree for mock mode.
- [x] Twenty mock markets work through HTTP; ranking, explanation, and simulation endpoints return results.
- [x] Ranking and seeded simulation tests pass; the UI consumes engine results.
- [x] Replace mock ranking data on the backend with 20 verified candidates and 15 reference markets. The hosted API returns ranking ID `e1e3650e5a6a13ca8a48`.
- [x] Complete hosted frontend visual flow and desktop rehearsal. Local API error/retry behavior and stale-response handling passed. Mobile demo is not required. Warm simulation latency above two seconds is accepted for this hackathon demo and is not a P0 gate.
- [x] Freeze the verified release and rehearse rollback and local fallback.

## P1 and P2 backlog

### Developer 1

- [x] P1: Confirm twenty verified candidate metros and document exclusions and uncertainty. All 20 configured `verified.v2` candidates rank; no candidate is excluded. Coverage outside that configured set remains unassessed. See `docs/data-sources.md`.
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
