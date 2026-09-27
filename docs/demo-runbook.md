# Demo runbook

## Before presenting

Run the commands in README. Confirm `/health` mode and release ID. Keep the mock label visible unless a verified release has passed publishing and startup validation. Validate source access independently of application startup; the demo must not depend on live dataset services.

## Narrative

1. “Which market deserves further investigation?” Show the map and shortlist.
2. Move one weight and show a changed ranking, explaining weights are assumptions.
3. Select a metro. Open the provenance drawer. Distinguish synthetic versus public evidence.
4. Explain familiarity as similarity across selected features, not safety.
5. Simulate a seven-day hypothetical fleet launch.
6. Increase fleet or demand, then pricing. Discuss wait, rejection, deadhead, charging and gross revenue.
7. Open assumptions and show seed, model version and accounting limits.

## Local proof

`uv run pytest`; `npm --prefix apps/web run typecheck`; `npm --prefix apps/web run build`; `npm --prefix apps/web run test:e2e`.

## Mapbox setup

Copy `apps/web/.env.example` to `apps/web/.env.local` and set `NEXT_PUBLIC_MAPBOX_TOKEN` to a public `pk.` token from the Mapbox account. Restart the Next.js dev server after changing environment values. The token is exposed to browser code by design; never use a secret `sk.` token. Without a token, the market explorer keeps its local U.S. map and the simulator shows an illustrative city grid. The simulation API returns hourly aggregates, not per-vehicle routes, so animated routes remain illustrative.

The browser smoke starts local services if needed. It exercises selection, provenance, simulation, changed fares, playback and mobile layout. It writes screenshots under ignored `apps/web/test-results`.

## Deployment

Vercel project `odd-scout-web` uses root directory `apps/web`. Current production deployment `CyDER2SMieZuNoGuXRvb8SpG2R8Q` is ready at `https://odd-scout-web.vercel.app`. Production and Preview use `NEXT_PUBLIC_API_BASE_URL=https://odd-scout-api.onrender.com` and `NEXT_PUBLIC_DATA_TRANSPORT=http`. Generated types remain in the monorepo; Vercel includes files outside the root directory in its build.

Render uses the root Dockerfile and `/health`. Service `srv-dartlbm0tbcc73d0lmug` serves `verified.v2` at `https://odd-scout-api.onrender.com`; seven hosted API checks pass. Deployment `dep-das5lpu0tbcc73dudkc0` adds `https://odd-scout-web.vercel.app` to `ODD_ALLOWED_ORIGINS` and preserves both localhost origins. API GET and OPTIONS preflight return HTTP 200 with the expected CORS headers. The live frontend shows the verified data label and 20 candidate metros. `render.yaml` selects the verified release.

## Desktop and recovery rehearsal — 2026-09-26

Hosted desktop flow passed on production. The explorer loaded `verified.v2` / `ranking.v2` with 20 ranked metros and zero unranked metros. Providence started at rank 1 with score 59.6. The provenance drawer showed `verified` mode, release metadata, source links and hashes, plus resolved Nashville, San Diego, and Dallas reference names.

Changing familiarity weight to 0.7 recalculated normalized weights to 54/15/31. Jacksonville moved to rank 1 at 62.8 and Providence to rank 2 at 62.7. Reset restored 40/20/40 and Providence at rank 1, 59.6. The simulator loaded its seven-day result; changing fleet size from 50 to 60 changed completed rides from 6,802 to 6,857. Reset restored the default result. Ranking and simulation showed their update states while requests ran.

The hosted deployment rollback was rehearsed without using the broken initial deployment. Vercel redeployed the current production source to `CyDER2SMieZuNoGuXRvb8SpG2R8Q` (same commit `28405ffd`). Instant Rollback assigned production to known-good `3EBUh1KQSj3cY1Rucs2ELs2aNPYk`; the stable URL returned HTTP 200 and Render still reported verified mode. The new deployment was then promoted back to production, clearing the rollback hold and restoring normal production assignment. Current production is `CyDER2SMieZuNoGuXRvb8SpG2R8Q`. The broken `6dStk6XEVgTzFEeDMHMVNBygv17K` deployment was not selected.

Local HTTP fallback passed with FastAPI serving the committed `verified.v2` release and Next.js pointed to `http://127.0.0.1:8000`. `/health` reported `verified` and `ranking.v2`; the browser rendered the same 20 ranked metros and release ID. Stopping the local API produced the visible Retry connection state without a framework error overlay. Restarting the API and using Retry restored the verified market list. Playwright test `superseded ranking responses cannot overwrite newer selection` passed (1 test) on 2026-09-26.

A mobile demo is not required for P0. Warm hosted simulation measurements remain above two seconds; cold-start latency remains unmeasured.

Render Free sleeps after inactivity. Warm the service before a demo. Three verified default-scenario measurements were 2.708, 2.947, and 2.866 seconds, above the two-second target. Cold-start latency remains unmeasured and may be longer. Prior smoke-checked mock deployment `dep-das4ir0u01pc73ensm50` remains in Render history as a backend rollback target; keep local HTTP fallback available.

## Failure handling

API errors retain prior simulation output with an error/retry state. Invalid input is rejected, not coerced into a different scenario. Missing verified data prevents verified startup. LLM access is irrelevant to P0. Local HTTP mode is the main fallback; static fixture replay is a last resort with controls disabled and its replay label visible.

## Completion checklist

- [x] Local startup without API keys.
- [x] Twenty synthetic metros and five reference fixtures.
- [x] Explainable ranking and finite seeded fleet operations.
- [x] No mixing synthetic and verified modes.
- [x] Render mock backend deployed, measured, and smoke checked; owner accepts warm simulation latency above two seconds for the hackathon demo.
- [x] Twenty verified ranked candidates with public evidence served by the Render API.
- [x] Hosted frontend connection; production Vercel frontend reads the verified Render API.
- [x] GitHub Actions run #23 passed on PR commit `9674d85`, including the new startup test.
- [x] Desktop hosted rehearsal, Vercel rollback, and local verified HTTP fallback; results recorded above.
