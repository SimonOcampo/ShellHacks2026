# Local verification — 2026-09-26

Verified on Windows with Python 3.12 and Node 22:

- 22 pytest checks pass: request validation, contract drift, committed fixtures, CORS, ranking formulas, missing data, references, deterministic simulation, fare rounding, finite charging, cutoff accounting, and adapter transforms.
- Generated OpenAPI export is deterministic. Generated TypeScript typechecks.
- Next.js production build succeeds.
- Two Chromium browser tests pass: full city/evidence/scenario flow, changed fares, playback, mobile width, and superseded ranking requests.
- Desktop market, desktop simulation, and mobile screenshots were visually inspected. A GeoJSON winding issue was found and corrected.
- npm audit reported zero vulnerabilities after updating Next.js.
- Python undefined-name/unused-import checks pass.
- Default seven-day simulation generated 6,941 requests. Measured local engine runtime ranged from 0.41 to 0.90 seconds. This is not a benchmark of the eventual hosted service.

Browser screenshots and traces are generated under ignored `apps/web/test-results`. GitHub Actions run #21 passed on `main` commit `02b9c72` on 2026-09-26. This run predates the new startup test.

The test client emits a dependency deprecation warning about its current httpx integration; all assertions pass. It does not affect the served API.

## Outstanding acceptance

The Render backend is live at service `srv-dartlbm0tbcc73d0lmug`, deployment `dep-darv61avcj2c73acjng0`, commit `329076b`, using mock release `mock.v1`. On 2026-09-26, `/health`, config, city list/detail, rankings, explanations, and simulations returned HTTP 200. The API exposes 20 candidate cities. Three warm default seven-day simulations took 2.578, 2.659, and 2.095 seconds end to end. Each conserved 6,941 requests: 6,802 completed, 133 rejected, and 6 unfinished. Results shared one simulation ID. These measurements exceed the two-second target on Render Free. The project owner accepts this latency for the hackathon mock demo; this does not mean the target passed. Render deployment history retains prior smoke-checked deployment `dep-darunmg473hc73fbpsdg` (commit `23679e6`) with status `deactivated`, as rollback target. No rollback was performed. Local HTTP mode remains the fallback.

No verified eight-metro release, hosted frontend, or deployed rehearsal is recorded. CI for the new startup test remains pending. Official Census acquisition requires a key. NOAA/geography harmonization and dated reference evidence still require completion before verified publication. P1/P2 remain intentionally unimplemented.
