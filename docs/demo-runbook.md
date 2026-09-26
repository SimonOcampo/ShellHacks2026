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

The browser smoke starts local services if needed. It exercises selection, provenance, simulation, changed fares, playback and mobile layout. It writes screenshots under ignored `apps/web/test-results`.

## Deployment

Vercel root directory: `apps/web`. Set `NEXT_PUBLIC_API_BASE_URL` to the Render HTTPS service and `NEXT_PUBLIC_DATA_TRANSPORT=http`. Generated types remain in the monorepo; enable access to files outside the root directory if Vercel requires that setting.

Render uses the root Dockerfile and `/health`. Set `ODD_ALLOWED_ORIGINS` to the exact Vercel origin. `render.yaml` explicitly defaults to mock mode because no verified release exists. Set matching mode/path only after verified publication. The selected hosting plan and accounts must be provisioned externally; no deployment is claimed by committing these definitions.

Use a plan that does not sleep during the presentation, or warm the service before rehearsal. Validate the default scenario on that actual host against the two-second target. Retain previous frontend deployment, backend image and release for rollback.

## Failure handling

API errors retain prior simulation output with an error/retry state. Invalid input is rejected, not coerced into a different scenario. Missing verified data prevents verified startup. LLM access is irrelevant to P0. Local HTTP mode is the main fallback; static fixture replay is a last resort with controls disabled and its replay label visible.

## Completion checklist

- [x] Local startup without API keys.
- [x] Twenty synthetic metros and five reference fixtures.
- [x] Explainable ranking and finite seeded fleet operations.
- [x] No mixing synthetic and verified modes.
- [ ] Eight verified ranked candidates with official evidence.
- [ ] Hosted frontend/backend and chosen-host latency proof.
- [ ] Remote CI success and deployed rehearsal.
