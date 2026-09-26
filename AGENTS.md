# ODD Scout

Public-data market screening and hypothetical fleet operations. Never claim AV safety, deployment approval, or reproduction of a private operator's model.

## Ownership
- Developer 1: `data/`, `packages/ranking/`, ranking/reference configuration.
- Developer 2: `backend/`, `packages/contracts/`, simulation configuration, CI and deployment.
- Developer 3: `apps/web/`, explanation UX.
- Coordinate shared contract changes with Developer 2 and affected consumers. Keep agent tasks bounded by objective, allowed paths, inputs, outputs, tests, and forbidden domains.

## Contracts and invariants
Pydantic is canonical. Export with `uv run python -m contracts.export`; generate TypeScript with `npm --prefix apps/web run generate:api`. Never hand-edit generated types.
Keep raw snapshots immutable. Never fabricate verified data. Missing is not zero. Keep mock and verified releases separate. Engines are pure and deterministic; LLMs never calculate results.

## Commands
`uv sync`; `npm --prefix apps/web ci`.
`uv run uvicorn odd_scout.api.main:app --reload`; `npm --prefix apps/web run dev`.
`uv run pytest`; `npm --prefix apps/web run typecheck`; `npm --prefix apps/web run build`.

## Done
Relevant tests pass, contracts agree, provenance resolves, assumptions and limitations are documented. Protect the working P0. P1/P2 remain backlog until verified P0 passes.
