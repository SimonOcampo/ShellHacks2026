# Three-developer workflow

Developer 1 owns sources, harmonization, releases, ranking, and ranking tests. Developer 2 owns canonical contracts, FastAPI, simulation, backend tests, and deployment. Developer 3 owns Next.js, map, charts, controls, API client, explanation UX, accessibility, and browser proof.

The initial scaffold lives on `codex/odd-scout-foundation`. The repository had no commits or remote when work began. No commit or remote publication is performed automatically. Establish reviewed `main` from this scaffold, then have all three developers branch from the same commit.

Use small PRs and continuous integration. Contract PRs require Developer 2 plus affected consumers; regenerate OpenAPI/types and update fixtures together. Avoid changing other domains' lockfiles. Agents receive exact objectives, allowed paths, inputs, outputs, tests, and forbidden domains. Do not give open-ended “improve everything” tasks.

## Next bounded tasks

| Owner | Objective | Inputs / outputs | Verification |
|---|---|---|---|
| Developer 1 | Publish first verified eight-metro release | Official ACS, NOAA, AFDC, CBSA evidence; standardized release and manifests | Source hashes, joins, completeness, rank tests |
| Developer 2 | Deploy existing backend and validate host latency | Container and release; health URL and benchmark | Health, API smoke, default scenario <2 s target |
| Developer 3 | Deploy UI and rehearse | Backend URL and current UI; working hosted flow | Browser smoke, mobile, provenance and errors |

These tasks run independently after shared scaffold review. Developer 1 must not change frontend or simulation. Developer 2 must not change ranking methodology. Developer 3 must not calculate scores in React.

## Integration gates

1. Contracts, fixture schemas, startup and ownership agree.
2. Twenty mocks display through HTTP, selection/explanation/simulation work.
3. Ranking and seeded simulation tests pass; UI consumes real engines.
4. Eight verified candidates and reference evidence replace mock ranking release.
5. Host deployment, visual flow, errors, and performance pass.
6. Freeze release, rehearse, keep rollback/local fallback.

## Backlog

**P0 delivered locally:** monorepo, contracts/types, twenty-metro mock release, engines, HTTP integration, map, rankings, controls, factor/source drawer, template explanations, simulation, KPIs/charts/playback, environment example, docs, CI definition, deployment definitions.

**P0 outstanding:** complete official ingestion/harmonization; publish eight verified candidates; provision frontend/backend; benchmark chosen host and rehearse deployed flow. Local tests cannot establish remote CI or deployment success.

**P1, after P0:** live LLM with evidence validation/fallback; twenty verified metros; road and intersection features; reference-category controls; sensitivity and baseline comparison; charger/battery/speed controls; crash context; richer uncertainty and geography handling.

**P2:** cosmetic map animation, street routing, airport/tourism and severe-weather features, repositioning/charging optimization, larger cohort, saved scenarios/accounts.

Excluded: driving physics/perception, safety certification, private operator algorithms, advanced ML, dynamic pricing, real customer data, billing, database, queues, Kubernetes.
