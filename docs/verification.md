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

Browser screenshots and traces are generated under ignored `apps/web/test-results`. CI definition is committed as source, but no remote CI run occurred because the repository has no remote or published commit.

The test client emits a dependency deprecation warning about its current httpx integration; all assertions pass. It does not affect the served API.

## Outstanding acceptance

No verified eight-metro release, no live deployment, no deployed-host performance measurement, and no remote CI proof. Official Census acquisition requires a key. NOAA/geography harmonization and dated reference evidence still require completion before verified publication. P1/P2 remain intentionally unimplemented.
