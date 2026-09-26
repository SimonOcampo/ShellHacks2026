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

Browser screenshots and traces are generated under ignored `apps/web/test-results`. GitHub Actions run #23 passed on PR commit `9674d85` on 2026-09-26, including the new startup test.

The test client emits a dependency deprecation warning about its current httpx integration; all assertions pass. It does not affect the served API.

## Historical mock deployment and outstanding hosted integration

The Render backend is live at service `srv-dartlbm0tbcc73d0lmug`, deployment `dep-darv61avcj2c73acjng0`, commit `329076b`, using mock release `mock.v1`. On 2026-09-26, `/health`, config, city list/detail, rankings, explanations, and simulations returned HTTP 200. The API exposes 20 candidate cities. Three warm default seven-day simulations took 2.578, 2.659, and 2.095 seconds end to end. Each conserved 6,941 requests: 6,802 completed, 133 rejected, and 6 unfinished. Results shared one simulation ID. These measurements exceed the two-second target on Render Free. The project owner accepts this latency for the hackathon mock demo; this does not mean the target passed. Render deployment history retains prior smoke-checked deployment `dep-darunmg473hc73fbpsdg` (commit `23679e6`) with status `deactivated`, as rollback target. No rollback was performed. Local HTTP mode remains the fallback.

The corrected `verified.v2` artifact resolves the three source-publication gaps through fresh commute evidence and inherited checks for unchanged sources. It is now selected on Render; deployed proof appears below. The exact hosted frontend origin and deployed browser rehearsal remain outstanding. The project owner accepts the inherited source checks without repeating the full raw replay. P1/P2 remain intentionally unimplemented.

## Developer 2 verified-release compatibility — 2026-09-26

Validated against `main` commit `4f28681` after Developer 1's merge. The selected file was `data/releases/verified.v1.json`, with SHA-256 `e5099e4612908ced11403498afd6ab62953a44c0b1777c2ef0a19b51dfe737c6`. Set `ODD_DATA_MODE=verified` and `ODD_DATA_RELEASE=data/releases/verified.v1.json` for this local check.

The FastAPI `TestClient` entered the real application lifespan, loading and validating the committed release without mocked data or loader stubs. `/health`, `/api/v1/config`, `/api/v1/cities`, city detail, rankings, explanation, and simulation all returned HTTP 200. Versioned responses reported `verified` and `ranking.v2`. Rankings contained 20 ranked candidates, zero unranked candidates, and 15 references, with ranking ID `93edf127d62f0d427f2d`. The explanation's ranking ID matched the ranking response.

The default seven-day simulation for the top-ranked candidate, `cbsa:39300`, returned 6,941 requests: 6,802 completed, 133 rejected, and 6 unfinished. Explicitly selecting `mock` with `data/releases/mock.v1.json` and entering a fresh application lifespan restored mock health and 20 ranked candidates. These are local application checks, not deployed smoke tests or a source-quality approval.

The root suite passed with `uv run pytest -q`: 45 tests, including mode mismatch rejection, startup candidate threshold, CORS, ranking, contracts, and simulation invariants. `uv run python -m contracts.export` and `npm --prefix apps/web run generate:api` regenerated the canonical artifacts without drift. `npm --prefix apps/web run typecheck` passed. The separate data suite could not collect in the root environment because optional data dependencies (`requests`, `geopandas`, and `shapely`) were absent; no data-suite pass is claimed here.

Developer 2's verified deployment is recorded below. Production CORS validation remains dependent on Developer 3's exact hosted origin.

## Corrected verified.v2 release — 2026-09-26

`verified.v2` has SHA-256 `8533f5fec66352797963cd41a23430642bac6ad0ff0a50569449d013a9445df6`. `verified.v1` retains SHA-256 `e5099e4612908ced11403498afd6ab62953a44c0b1777c2ef0a19b51dfe737c6`. The correction audit binds the parent release, prior source audit, manifest, and two newly downloaded official ACS tables by hash. All 35 metros use B08013 aggregate travel minutes divided by B08303 workers who did not work from home; both input MOEs are present and valid. The audit preserves the numerical observations and labels inherited evidence explicitly.

`uv run --with-editable ./data pytest tests data/tests -q -k 'not test_manifest_hashes_match_saved_raw_bytes and not test_verified_release_reconciles_with_preserved_sources'` passed 78 tests, with two existing optional tests skipped and the two named raw-replay checks deselected. A preceding full data-suite attempt confirmed those two checks require the absent historical raw bundle. They remain runnable with that bundle and were not weakened to pass without it. Dependencies are supplied from `data/pyproject.toml` through `--with-editable ./data`.

With `ODD_DATA_MODE=verified` and `ODD_DATA_RELEASE=data/releases/verified.v2.json`, the actual FastAPI lifespan and seven local API endpoints passed again. Rankings return 20 candidates, zero unranked candidates, 15 references, and ID `e1e3650e5a6a13ca8a48`. The top candidate remains `cbsa:39300`. Its default seven-day simulation conserves 6,941 requests: 6,802 completed, 133 rejected, and 6 unfinished. Explanation and ranking IDs agree. The correction publisher also accepts an identical rerun without changing either release.

No API schema, generated TypeScript, ranking weights, or simulation settings changed in this correction. Deployment configuration selects the new release explicitly.

## Hosted verified.v2 backend — 2026-09-26

Render service `srv-dartlbm0tbcc73d0lmug` serves `https://odd-scout-api.onrender.com`. The service tracks `main` with automatic deployment. Commit `5d879867e1bc7ab5da5ce05f874aeb26506715bc` passed GitHub Actions P0 acceptance run [36276939150](https://github.com/SimonOcampo/ShellHacks2026/actions/runs/36276939150). Deployment `dep-das4jcnpn0mc73eq63d0` became live after setting `ODD_DATA_MODE=verified` and `ODD_DATA_RELEASE=/app/data/releases/verified.v2.json`. Prior smoke-checked deployment `dep-das4ir0u01pc73ensm50`, which served mock mode from the same commit, remains deactivated in Render history as a rollback target. No rollback was performed.

The hosted `/health`, config, city list/detail, ranking, explanation, and default simulation endpoints all returned HTTP 200. `/health` reported `verified` and `ranking.v2` with data version ending `__commute-B08013-B08303-r2`. The API returned 20 ranked candidates, zero unranked candidates, 15 references, top city `cbsa:39300`, and ranking ID `e1e3650e5a6a13ca8a48`. The explanation matched that ranking ID. The default seven-day simulation returned ID `43012c31790f8e039ed0` and conserved 6,941 requests: 6,802 completed, 133 rejected, and 6 unfinished. Three warm calls took 2.708, 2.947, and 2.866 seconds end to end. These exceed the original two-second target; acceptance previously recorded for the mock demo does not prove the verified target passed.

Render reported no application error logs since the verified deployment began. The hosted frontend is still pending, so exact-origin CORS and the deployed browser flow have not been validated.
