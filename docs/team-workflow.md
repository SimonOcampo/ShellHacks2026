# Three-developer workflow

Developer 1 owns sources, harmonization, releases, ranking, and ranking tests. Developer 2 owns canonical contracts, FastAPI, simulation, backend tests, and deployment. Developer 3 owns Next.js, map, charts, controls, API client, explanation UX, accessibility, and browser proof.

`main` is the shared integration base. Have all three developers branch from the same approved `main` commit and merge small, reviewed PRs back to `main`.

Use small PRs and continuous integration. Contract PRs require Developer 2 plus affected consumers; regenerate OpenAPI/types and update fixtures together. Avoid changing other domains' lockfiles. Agents receive exact objectives, allowed paths, inputs, outputs, tests, and forbidden domains. Do not give open-ended “improve everything” tasks.

## Backlog by developer

Each task names an owner, bounded files, an output, and proof. Start the independent tasks in parallel. Coordinate contract or release changes before dependent integration work.

### Developer 1 — data and ranking

**P0. Publish the first verified release.**

- **Paths:** `data/`, `packages/ranking/`, `config/ranking.v1.json`, `config/references.v1.json`, ranking tests, and `docs/data-sources.md`.
- **Inputs:** official 2024 ACS five-year estimates and matching CBSA/county geography; NOAA 1991–2020 station normals; operational public AFDC charging snapshot; dated public evidence for reference-market status.
- **Output:** immutable, provenance-complete release with at least eight fully measured candidate metros, eligible commercial reference markets, frozen geographic vintage and normalization bounds. Keep incomplete candidates visibly unranked. Never promote synthetic measurements.
- **Proof:** verify source hashes, joins, ACS denominators and margins of error, NOAA scale/quality flags and station distances, AFDC deduplication/status/port counts, reference evidence dates, candidate completeness, and ranking formula tests. Run publisher and verified-startup checks.
- **Blocker:** obtain the required Census API key through the team's approved local setup. Never paste the key into chat, fixtures, manifests, or commits. If unavailable, report the exact acquisition blocker; keep mock mode and do not claim verified P0.

**P1. Expand and improve the ranking.**

- Grow verified coverage toward twenty metros; document exclusions and uncertainty.
- Add road and intersection features in a versioned release, after checking network completeness and geography joins. Coordinate a model-version change before updating the frontend feature display.
- Add explicit reference-category selection and weight-sensitivity comparisons with deterministic ranking tests.
- Add crash context only as unscored public context after validating the NHTSA source and denominators. Keep it out of safety or readiness claims.

**P2. Research optional opportunity/environment features.**

- Evaluate airport activity and severe-weather features. Add only when sources, geographic assignment, coverage, and meaning are defensible. Keep street routing and large-scale collection out of this task.

**Do not own:** frontend implementation, API or simulation code. Do not change scoring without documenting the model version and coordinating the contract/UX effects.

### Developer 2 — contracts, backend, simulation, and deployment

**P0. Keep contracts and engine gates green.**

- **Paths:** `backend/`, `packages/contracts/`, `tests/contracts/`, `tests/simulation/`, CI, `Dockerfile`, `render.yaml`, and `docs/contracts.md` / `docs/simulation.md`.
- **Inputs:** generated Pydantic/OpenAPI contract, verified release from Developer 1, frontend origins from Developer 3.
- **Output:** load and validate the selected immutable release; preserve mock mode as fallback by explicit configuration; serve versioned API; run bounded deterministic fleet simulation; keep errors, request limits, and provenance intact.
- **Proof:** run contract, engine, and API tests; regenerate OpenAPI and TypeScript without drift; verify mock/verified mode separation, startup rejection for incomplete verified data, request conservation, battery/charger bounds, cutoff accounting, fares, error shapes, and CORS.

**P0. Deploy the backend and measure it.**

- **Paths:** deployment files and necessary backend configuration only.
- **Inputs:** verified release path and Vercel origin when available. A mock deployment may be used earlier if its UI is visibly labeled.
- **Output:** reachable Render service, `/health`, and deployment/release IDs.
- **Proof:** API smoke tests against the deployed service and default-scenario timing below the two-second target. Record actual results. Preserve the prior image/release for rollback. Do not claim production readiness before a verified release is selected.

**P1. Add live explanation service after P0.**

- Own server-side LLM credentials, request limits, evidence validation, caching, and deterministic template fallback. Coordinate accepted fields with Developer 3; pass calculated structured evidence only. Never let model output set ranks, facts, or simulation results.
- Add resolved battery, charging, and speed inputs only if those scenario controls are approved as the next slice; keep response assumptions explicit and seeded results reproducible.

**Do not own:** frontend design or independent ranking-method changes. Coordinate all shared schema changes with affected developers and regenerate TypeScript.

### Developer 3 — frontend, explanations UX, and demo

**P0. Finish and rehearse the connected demo.**

- **Paths:** `apps/web/`, browser tests, and `docs/demo-runbook.md`.
- **Inputs:** generated API types, deployed or local API URL, verified release metadata from Developers 1 and 2.
- **Output:** responsive market explorer and scenario flow with top candidates, three ranking controls, factor breakdown, reference similarity, provenance drawer, loading/error states, and seven-day charts/playback. Keep source evidence and modeled assumptions distinct. Preserve the AV-safety/deployment boundary in the visible product copy.
- **Proof:** run typecheck, production build, browser flow at desktop and mobile sizes; confirm source links, mock/verified labels, changed ranking weights, changed scenario inputs, cancellation of stale responses, and graceful API errors. Rehearse against the deployed backend when it exists.

**P1. Add comparison and explanation UX.**

- Build UI for reference-category exploration, weight sensitivity, baseline-versus-scenario comparisons, expanded uncertainty, and additional verified cities only after their API fields/releases are agreed.
- Integrate live analyst wording only after Developer 2 ships the guarded endpoint. Keep numeric scores rendered from the deterministic API response, cite evidence IDs, and show the template when the service fails.

**P2. Add optional visual polish.**

- Consider lightweight illustrative map motion only after the hosted P0 demo is reliable. Label animation as illustrative; never use it to calculate fleet metrics.

**Do not own:** data acquisition, ranking calculations, or simulation calculations. Do not reconstruct scores in React.

### Shared integration work

1. All three review the clean `main` scaffold and current contracts; open small owner-specific branches from the same base.
2. Developer 1 publishes a verified release while Developers 2 and 3 continue mock integration and backend/frontend deployment.
3. Developer 2 validates the release at startup and deploys it; Developer 3 switches the frontend to its API URL and rehearses the full flow.
4. Each owner reviews only contract or data-release changes that affect their consumer. Regenerate artifacts and rerun the affected gates before merging.
5. Freeze the verified release, rehearse rollback and local fallback, then capture the demo result.

Developer 1 must not change frontend or simulation. Developer 2 must not change ranking methodology. Developer 3 must not calculate scores or trips in React.

## Integration gates

1. Contracts, fixture schemas, startup and ownership agree.
2. Twenty mocks display through HTTP, selection/explanation/simulation work.
3. Ranking and seeded simulation tests pass; UI consumes real engines.
4. Eight verified candidates and reference evidence replace mock ranking release.
5. Host deployment, visual flow, errors, and performance pass.
6. Freeze release, rehearse, keep rollback/local fallback.

## Backlog status

**P0 delivered locally:** monorepo, contracts/types, twenty-metro mock release, engines, HTTP integration, map, rankings, controls, factor/source drawer, template explanations, simulation, KPIs/charts/playback, environment example, docs, CI definition, deployment definitions.

**P0 outstanding:** Developer 1 must complete official ingestion/harmonization and publish eight verified candidates. Developers 2 and 3 must provision services, verify their hosted connection, and rehearse the deployed flow. Local tests cannot establish remote CI or deployment success.

**P1/P2:** assigned to owners above. Defer until verified P0 passes.

Excluded: driving physics/perception, safety certification, private operator algorithms, advanced ML, dynamic pricing, real customer data, billing, database, queues, Kubernetes.
