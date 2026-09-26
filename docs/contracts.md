# Contracts

Authoritative DTOs: `packages/contracts/models.py`. Generated artifacts: `packages/contracts/openapi.json` and `packages/contracts/generated/api.d.ts`.

```sh
uv run python -m contracts.export
npm --prefix apps/web run generate:api
```

Snake_case JSON, explicit units, finite numbers only, no extra fields. Null means unavailable. Pydantic validates numeric bounds, fare precision, battery thresholds, demand curves, legal evidence, feature units and provenance links. Validation errors use the same error envelope as HTTP errors.

| Route | Contract |
|---|---|
| GET `/health` | Health with release versions |
| GET `/api/v1/config` | Feature registry, bounds, references, weights, assumptions |
| GET `/api/v1/cities` | Candidate summaries and versions |
| GET `/api/v1/cities/{city_id}` | CityFeature including measurements and provenance |
| POST `/api/v1/rankings` | RankingRequest to RankingResult |
| POST `/api/v1/cities/{city_id}/explanation` | RankingRequest to Explanation |
| POST `/api/v1/simulations` | SimulationRequest to SimulationResult |

Errors: `{ "error": { "code": "...", "message": "...", "details": [] } }`.
404: unknown city; 413: request-count ceiling exceeded; 422: invalid inputs or references; 429: simulation capacity busy. 503 is reserved for an unavailable service. Framework startup failure means the service does not become healthy.

Weights normalize to one and must have positive finite sum. Omitted API weights use `config/ranking.v1.json`. Reference selections must be nonempty, unique, known, and enabled. Announced/testing references are never selected by default.

Ranking identity hashes the full release, normalized weights, and reference selection. Simulation identity hashes versions, resolved inputs, and assumptions. No runtime timestamp or UUID enters either result.

Fixture generation uses actual mock-data API responses. Fixture transport is for the default scenario only, with editing disabled. It does not pretend to recalculate changed assumptions. The HTTP transport uses the real engines even while ranking measurements are mock.

Input and output schemas may differ because Pydantic emits resolved defaults in responses. Consume generated types, not manually duplicated interfaces. CI checks export drift.
