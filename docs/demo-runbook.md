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

Render uses the root Dockerfile and `/health`. The backend is live as service `srv-dartlbm0tbcc73d0lmug` on mock release `mock.v1`; API smoke checks pass. The Vercel frontend is not hosted yet. Set `ODD_ALLOWED_ORIGINS` to its exact origin when available. `render.yaml` defaults to mock mode. Select verified mode and release only after publication and startup validation. This mock deployment is not production-ready.

Render Free sleeps after inactivity. Warm the service before rehearsal. Three warm default-scenario measurements were 2.578, 2.659, and 2.095 seconds, above the two-second target. The project owner accepts this latency for the hackathon mock demo; cold-start latency remains unmeasured and may be longer. Prior smoke-checked deployment `dep-darunmg473hc73fbpsdg` remains in Render history as rollback target; keep local HTTP fallback available.

## Failure handling

API errors retain prior simulation output with an error/retry state. Invalid input is rejected, not coerced into a different scenario. Missing verified data prevents verified startup. LLM access is irrelevant to P0. Local HTTP mode is the main fallback; static fixture replay is a last resort with controls disabled and its replay label visible.

## Completion checklist

- [x] Local startup without API keys.
- [x] Twenty synthetic metros and five reference fixtures.
- [x] Explainable ranking and finite seeded fleet operations.
- [x] No mixing synthetic and verified modes.
- [x] Render mock backend deployed, measured, and smoke checked; owner accepts warm simulation latency above two seconds for the hackathon demo.
- [ ] Eight verified ranked candidates with official evidence.
- [ ] Hosted frontend connection.
- [x] GitHub Actions run #23 passed on PR commit `9674d85`, including the new startup test.
- [ ] Deployed rehearsal.
