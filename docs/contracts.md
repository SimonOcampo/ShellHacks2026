# Contracts

Authoritative DTOs: `packages/contracts/models.py`. Generated artifacts: `packages/contracts/openapi.json` and `packages/contracts/generated/api.d.ts`.

```sh
uv run python -m contracts.export
npm --prefix apps/web run generate:api
```

Snake_case JSON, explicit units, finite numbers only, no extra fields. Null means unavailable. Pydantic validates numeric bounds, fare precision, battery thresholds, demand curves, legal evidence, feature units and provenance links. Validation errors use the same error envelope as HTTP errors.

The canonical city contract recognizes 17 measurement keys: 15 `ranking.v2` scoring features and two optional informational road measurements, `average_aadt` (vehicles/day) and `lane_miles_per_km2` (lane-miles/km2). The optional measurements may be absent or null with `quality="missing"` and an explicit reason. They cannot enter feature specifications, normalization bounds, ranking factors, or factor IDs. All 15 scoring measurements remain required for a candidate to be ranked. Canonical exported city and reference IDs use `cbsa:<five-digit code>`; the pipeline may retain the bare code internally.

The restored `mock.v1` release keeps its original ten-variable `ranking.v1` methodology and synthetic provenance. The expanded `ranking.v2` registry contains exactly 15 features, with nine Familiarity, two Readiness, and four Opportunity features. Five network measurements join Familiarity in v2; the two informational road measurements remain excluded. The pipeline release exporter adapts internal city records to canonical IDs and validates the resulting `DataRelease` before it can publish. Keep historical releases immutable. A verified release must supply public HTTPS provenance, complete enabled references, frozen bounds, and at least eight complete ranked candidates before it is eligible for runtime selection. Missing source measurements remain null rather than zero.

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

The explanation endpoint always calculates ranking and template text on the server. For verified releases only, setting `GEMINI_API_KEY` in the backend environment enables an optional Gemini `gemini-2.5-flash` rewrite of the summary. The API key never enters the request or response. The model receives structured calculated factors, template text, and source IDs and periods. Only the summary can change; rank, score, advantages, tradeoffs, and evidence IDs remain deterministic. The response `mode` is `llm` only after output passes strict shape, length, citation-subset, and prohibited-claim checks. Invalid output, timeout, upstream failure, missing key, mock mode, unranked city, request quota, or busy capacity returns the existing template response. This validation checks citation identity and simple text constraints; it cannot prove every qualitative phrase true. Treat live text as wording, not additional evidence.

Live calls have a five-second timeout, a 300-token output cap, two concurrent slots, and ten attempts per client IP per minute per process. Valid responses cache for one hour, with at most 128 entries keyed by ranking ID and city. The in-memory limits and cache reset on restart and do not coordinate across workers. Keep `GEMINI_API_KEY` unset to disable live wording and preserve P0 behavior. The endpoint also retains the existing 16 KiB request limit.

Weights normalize to one and must have positive finite sum. Omitted API weights use the configuration for the selected release; the existing mock runtime remains on `config/ranking.v1.json` until a compatible verified release is deliberately selected. `config/ranking.v2.json` describes the expanded methodology but does not itself switch runtime data. Reference selections must be nonempty, unique, known, and enabled. Announced/testing references are never selected by default.

Ranking identity hashes the full release, normalized weights, and reference selection. Simulation identity hashes versions, resolved inputs, and assumptions. No runtime timestamp or UUID enters either result.

Fixture generation uses actual mock-data API responses. Fixture transport is for the default scenario only, with editing disabled. It does not pretend to recalculate changed assumptions. The HTTP transport uses the real engines even while ranking measurements are mock.

Input and output schemas may differ because Pydantic emits resolved defaults in responses. Consume generated types, not manually duplicated interfaces. CI checks export drift.
