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

## Gemini analyst setup

The backend reads `GEMINI_API_KEY` and optional `GEMINI_MODEL` from its process environment. Set the key as a backend secret only; never add it to a `NEXT_PUBLIC_*` variable or commit it. For local PowerShell, run the backend in the same terminal as this hidden-input prompt. The key stays in that process environment and is removed when the backend stops:

```powershell
$secureKey = Read-Host "Gemini API key" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $env:GEMINI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $env:GEMINI_MODEL = "gemini-3.6-flash"
  uv run uvicorn odd_scout.api.main:app --reload --host 127.0.0.1 --port 8000
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:GEMINI_MODEL -ErrorAction SilentlyContinue
}
```

Run the frontend separately with HTTP transport. If the key is absent or Gemini fails, chat uses a labeled deterministic evidence fallback. Render deployments need `GEMINI_API_KEY` configured in the service's secret environment. The chat endpoint limits each client to ten requests per minute, caches successful answers briefly, and returns only evidence IDs from the selected market.

The browser smoke starts local services if needed. It exercises selection, provenance, simulation, changed fares, playback and mobile layout. It writes screenshots under ignored `apps/web/test-results`.

## Deployment

Vercel root directory: `apps/web`. Set `NEXT_PUBLIC_API_BASE_URL` to the Render HTTPS service and `NEXT_PUBLIC_DATA_TRANSPORT=http`. Generated types remain in the monorepo; enable access to files outside the root directory if Vercel requires that setting.

Render uses the root Dockerfile and `/health`. The backend is live as service `srv-dartlbm0tbcc73d0lmug` on mock release `mock.v1`; API smoke checks pass. The Vercel frontend is not hosted yet. Set `ODD_ALLOWED_ORIGINS` to its exact origin when available. `render.yaml` defaults to mock mode. Select verified mode and release only after publication and startup validation. This mock deployment is not production-ready.

Render Free sleeps after inactivity. Warm the service before rehearsal. The latest warm default-scenario measurements were 2.67 and 2.76 seconds, above the two-second target. Repeat timing proof after the target passes. Earlier deployments failed, so no prior healthy backend image is available for rollback; keep local HTTP fallback available.

## Failure handling

API errors retain prior simulation output with an error/retry state. Invalid input is rejected, not coerced into a different scenario. Missing verified data prevents verified startup. Analyst chat falls back to a deterministic evidence summary when Gemini is unset or unavailable. Local HTTP mode is the main fallback; static fixture replay is a last resort with controls disabled and its replay label visible.

## Completion checklist

- [x] Local startup without API keys.
- [x] Twenty synthetic metros and five reference fixtures.
- [x] Explainable ranking and finite seeded fleet operations.
- [x] No mixing synthetic and verified modes.
- [x] Render mock backend deployed, measured, and smoke checked.
- [ ] Eight verified ranked candidates with official evidence.
- [ ] Default-scenario timing below two seconds and hosted frontend connection.
- [ ] Remote CI success and deployed rehearsal.
