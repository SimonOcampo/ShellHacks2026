# ODDyssey frontend

This Next.js application deploys directly to Vercel. Ranking, simulation, and
explanation requests continue to use the existing Python API. Deploy that API
separately; no backend or LLM secrets belong in the frontend.

The frontend visual system follows the [ODDyssey Figma Make design](https://www.figma.com/make/KiKHMkRKsYdL4yDLGoaSOP/Design-ODD-Scout-Web-App). The local Nashville, Charlotte, and Tampa images use the Unsplash photo URLs shown in that preview. Manrope is stored locally under `public/fonts/` with its Open Font License. The hero skyline is illustrative; market scores, labels, evidence, and simulation results come from the selected API release. Mapbox remains the interactive map.

Markets, Waymo references, SimEngine, and Methodology heroes use
white cards, regular geometric typography, and spacing informed by
[Waymo's public website](https://waymo.com/). That reference uses GT Walsheim;
ODDyssey uses self-hosted Outfit under its bundled Open Font License as an
independent alternative. The homepage retains its original Manrope typography
and split composition, with a decorative route connecting its five signal labels.
Markets and Waymo references show three diagonal capsules using New York City
and San Francisco imagery respectively. SimEngine uses a fixed Providence image;
Methodology uses Chicago. Hero imagery is illustrative and never contributes
to a score or indicates the currently selected simulation city.
The local `nyc.jpg` and `chicago.jpg` assets were supplied by the user; their
source and license metadata has not been supplied. The visual reference does not imply affiliation with
Waymo or reproduction of its private models. Shared styles live in
`src/app/waymo-inspired.css`; narrow layouts stack the text card below the
visible image area and preserve release and data-mode labels. The homepage and
data-mode indicators share the same rounded pill styling as secondary actions;
data-mode indicators are labels, not interactive controls.

## Vercel setup

1. Import the entire Git repository into Vercel.
2. Set **Root Directory** to `apps/web` and **Framework Preset** to **Next.js**.
3. Enable **Include source files outside of the Root Directory in the Build Step**.
   TypeScript imports the committed canonical types from
   `packages/contracts/generated/api.d.ts`. Uploading only `apps/web` is insufficient.
4. Use Node.js 22.x. Keep the default Next.js output directory. The committed
   `vercel.json` installs with `npm ci`, validates deployment variables, and runs
   `npm run build`.
5. Configure these variables for each intended Vercel environment before building:
   - `NEXT_PUBLIC_DATA_TRANSPORT=http`
   - `NEXT_PUBLIC_API_BASE_URL=https://odd-scout-api.onrender.com` (the API origin
     recorded in the repository deployment runbook; use your own hosted API origin
     when deploying a separate instance). Omit a trailing slash and `/api/v1`.
   - `NEXT_PUBLIC_MAPBOX_TOKEN`: a public Mapbox token permitted to serve your
     deployment domains. Without it, the existing labeled map fallback appears.
6. Have the backend owner add each deployed frontend origin to
   `ODD_ALLOWED_ORIGINS`. Preview domains also need explicit authorization.
   Browser requests go directly to the API, including POST requests and CORS
   preflights.
7. Deploy. Rebuild after changing any `NEXT_PUBLIC_*` variable, since Next.js
   embeds those values during the build.

The Vercel build fails early for an unset or invalid HTTP API origin instead of
shipping a frontend that connects to the visitor's localhost. Normal local builds
and development retain their existing localhost default.

For a deliberate offline demonstration, set `NEXT_PUBLIC_DATA_TRANSPORT=fixtures`.
The API URL is then unnecessary. This replays committed mock fixtures, disables
recalculation controls, and does not generate live explanations. It is not a
verified-data deployment and is never selected automatically.

## Verify

From the repository root:

```sh
npm --prefix apps/web ci
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
npm --prefix apps/web run test:e2e
```

The browser suite requires Python 3.12, uv, the repository Python dependencies,
and Playwright Chromium. See the root README for setup. To run the deployment
environment check locally, set the intended environment variables, then run
`node apps/web/scripts/validate-vercel-env.mjs`.

After deployment, check the data-mode label, city selection, changed ranking
weights, evidence sources, explanations, and a recalculated simulation. Check
Mapbox with the configured token and inspect the browser network panel for API
and CORS failures. A successful frontend build alone does not verify the hosted
API or Mapbox token.

Reference: [Vercel monorepo setup](https://vercel.com/docs/monorepos).

## Local verified release

The frontend uses the release selected by the HTTP backend. To serve `verified.v2`
locally, start the backend from the repository root in PowerShell:

```powershell
$env:ODD_DATA_MODE = "verified"
$env:ODD_DATA_RELEASE = "data/releases/verified.v2.json"
python -m uv run python -m uvicorn odd_scout.api.main:app --host 127.0.0.1 --port 8000
```

Keep `NEXT_PUBLIC_DATA_TRANSPORT=http` and the API origin set to
`http://127.0.0.1:8000` in `apps/web/.env.local`. Build and start the frontend
with `npm --prefix apps/web run build` and `npm --prefix apps/web run start -- --hostname 127.0.0.1`.
The verified release reports `ranking.v2` and the public source snapshot version;
the UI retains that source version for provenance. The standard browser suite
uses the mock release for its deterministic demo assertions.
