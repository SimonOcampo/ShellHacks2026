# Waymo Autonomous Driving City System

Made for ShellHacks 2026.

**Public-data market screening and hypothetical fleet simulation. Not an assessment of AV safety or deployment approval.**

Explore candidate U.S. metros, explain transparent scores, and run a reproducible seven-day fleet scenario. The local default contains **20 synthetic candidate metros and five synthetic reference records** and is visibly marked mock. Production uses the Vercel frontend at [odd-scout-web.vercel.app](https://odd-scout-web.vercel.app) and the Render API, which serves `verified.v2` with 20 public-data candidates and 15 references.

## Run locally

Requirements: Python 3.12, uv, Node 22, npm. Windows may require `python -m uv` and `npm.cmd` in place of `uv` and `npm`.

```sh
uv sync --frozen
npm --prefix apps/web ci
```

Start two terminals from the repository root:

```sh
uv run uvicorn odd_scout.api.main:app --reload --port 8000
```

```sh
npm --prefix apps/web run dev
```

Open [http://localhost:3000](http://localhost:3000). API documentation: [http://localhost:8000/docs](http://localhost:8000/docs). No source API or LLM key is required for the mock demo.

`.env.example` documents settings. Set backend variables in your shell, or use `uv run --env-file .env ...`. Next.js reads frontend settings from `apps/web/.env.local`. Never place source or LLM keys in public frontend variables.

## Working path

1. Explore the map and ranked list. The top three are highlighted.
2. Change pillar weights; deterministic backend rankings update.
3. Select a metro, read its analyst note, and inspect features and provenance.
4. Select **Simulate hypothetical launch**.
5. Change fleet, demand, fares, duration, or seed. Results recalculate.
6. Play the hourly timeline; inspect rides, wait, utilization, revenue, miles, charging, and unfinished requests.

Frontend fixture-only mode is available using `NEXT_PUBLIC_DATA_TRANSPORT=fixtures`. It replays default scenarios with editing disabled. HTTP mode enables real calculations against the selected data release.

## Verify and regenerate

```sh
uv run pytest
uv run python -m contracts.export
npm --prefix apps/web run generate:api
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
npm --prefix apps/web exec -- playwright install chromium
npm --prefix apps/web run test:e2e
```

Pydantic owns contracts. Generated OpenAPI and TypeScript are committed. To rebuild mock data and response fixtures:

```sh
uv run python -m adapters.mock
uv run python -m contracts.fixtures_export
```

## Data status and promotion

Census API requests require a key, but official Summary Files provide a keyless path. The corrected `verified.v2` release resolves the prior commute-method, missing-MOE, and AFDC-host gaps. Its incremental audit reuses Developer 1's hash-matched evidence for unchanged sources. Full raw replay requires the original archive. See [data sources](docs/data-sources.md) for proof, limitations, and the correction command. To select it locally, set `ODD_DATA_MODE=verified` and `ODD_DATA_RELEASE=data/releases/verified.v2.json`.

```sh
uv run python -m adapters.acquire acs
uv run python -m adapters.acquire afdc
uv run python -m adapters.publish prepared-release.json data/releases/verified.v1.json
```

Acquisition requires `CENSUS_API_KEY` for ACS; AFDC supports its limited public demo key or `AFDC_API_KEY`. Publishing requires validated official-source records, raw evidence and manifests, and at least eight complete ranked candidates. It does not create missing source data. See [data sources](docs/data-sources.md).

## Product boundary

Scores reflect selected public features and transparent modeling assumptions. Actual deployment requires mapping, real-world driving, validation, safety testing, regulatory approval, and operational testing. ODD Scout does not reproduce Waymo’s internal systems or scoring weights.

Simulation represents fleet operations in a synthetic service zone. Demand is assumed. Public charging measurements do not establish private depot availability. Gross revenue excludes operating costs and is not profit.

## Team and docs

- Developer 1: data and ranking.
- Developer 2: contracts, backend, and simulation.
- Developer 3: frontend and explanation UX.

Read [architecture](docs/architecture.md), [contracts](docs/contracts.md), [methodology](docs/methodology.md), [simulation](docs/simulation.md), [team workflow](docs/team-workflow.md), [demo runbook](docs/demo-runbook.md), and [decisions](docs/decisions.md).

Deployment definitions are included for Vercel (frontend root `apps/web`) and Render (`render.yaml`). The P0 desktop hosted rehearsal and rollback/local HTTP fallback rehearsal passed; see [verification status](docs/verification.md). Warm hosted simulation time exceeds the two-second target, and cold-start time remains unmeasured. Keep mock and verified releases separate. P1 and P2 remain backlog.
