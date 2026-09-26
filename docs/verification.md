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

Browser screenshots and traces are generated under ignored `apps/web/test-results`. The CI workflow is committed. Remote CI status has not been recorded in this verification log.

The test client emits a dependency deprecation warning about its current httpx integration; all assertions pass. It does not affect the served API.

## Outstanding acceptance

The Render backend is live at service `srv-dartlbm0tbcc73d0lmug`, deployment `dep-darunmg473hc73fbpsdg`, commit `23679e6`, using mock release `mock.v1`. `/health`, config, city list/detail, rankings, and simulations returned HTTP 200. The API exposes 20 candidate cities. Default seven-day simulation conserved 6,941 requests: 6,802 completed, 133 rejected, and 6 unfinished. Two warm requests took 2.67 and 2.76 seconds end to end, above the two-second target on Render Free. A warm health request took 264 ms; the simulation response body transferred in under 1 ms. Earlier deployments failed, so no earlier healthy image is available for rollback. Local HTTP mode remains the fallback.

No verified eight-metro release, hosted frontend, deployed rehearsal, sub-two-second simulation proof, or remote CI result is recorded. Official Census acquisition requires a key. NOAA/geography harmonization and dated reference evidence still require completion before verified publication. P1/P2 remain intentionally unimplemented.
