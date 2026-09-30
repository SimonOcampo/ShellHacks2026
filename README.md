# Oddyssey

Oddyssye is a public-data market screening tool and a hypothetical fleet-operations simulator. It compares the 20 biggest U.S. metro areas without Waymo Operations or Planned Waymo operations with a dated set of Waymo markets using transparent, configurable public features.

**The product does not assess autonomous-vehicle safety, grant deployment approval, forecast ride-hailing demand, or reproduce Waymo’s private models or operating data.** Scores and simulations are reproducible screening scenarios built from documented data and assumptions.

## What is in this repository

There are two distinct data modes:

- **Mock demo:** the backend defaults to the synthetic mock.v1 release: 20 synthetic candidate metros and five illustrative reference records. This mode runs locally without source-data or LLM credentials.
- **Verified release:** data/releases/verified.v2.json contains 20 candidate CBSAs and 15 enabled Waymo commercial-market references. It uses public-source measurements and a frozen ranking.v2 model. Select it explicitly with the environment variables below; the backend never switches from mock to verified, or back, on its own.

The verified.v2 release records source status as of **September 26, 2026**. The public market list and source measurements can become stale; the app does not refresh them at request time.

## System design

Data acquisition and feature engineering happen offline. The web app does not call Census, NOAA, AFDC, or Waymo to calculate a score.

    Public source snapshots
      → source-specific loaders and cleaning
      → Census CBSA geography and feature engineering
      → validated CityFeature records with source provenance
      → immutable DataRelease with frozen normalization bounds
      → FastAPI ranking and simulation endpoints
      → Next.js user interface and playback

The running service loads a release file at startup. Pydantic models in packages/contracts define the canonical request and response shapes. FastAPI validates requests and runs the Python ranking or simulation engines. OpenAPI is generated from those models, and TypeScript API types are generated for the web client. The browser displays server results; it does not recalculate market scores or simulation metrics.

There is no runtime database, job queue, or source-data ingestion service in P0. Releases and fixtures are files. Ranking and simulation engines are deterministic for a given release, request, assumptions, and seed. Explanations use deterministic templates by default. An optional, bounded Gemini rewrite can change only the summary wording for verified data; it cannot calculate or alter scores.

### Repository map

- **apps/web/** — Next.js, React, and TypeScript interface; maps, city details, ranking controls, explanation panel, simulation controls, and playback.
- **backend/odd_scout/** — FastAPI routes, release loading, deterministic explanation templates, optional live wording, request limits, and fleet simulation.
- **packages/contracts/** — canonical Pydantic contracts, committed OpenAPI document, generated TypeScript declarations, and API fixtures.
- **packages/ranking/odd_ranking/** — feature transforms, frozen-bound normalization, ranking, reference comparisons, and normalization audit tools.
- **data/src/datasets/** — public-source download, load, and processing modules.
- **data/src/pipeline/** — city-feature generation, release export/correction, source verification, and reference-build commands.
- **data/src/contracts/** and **data/src/common/** — data contracts, provenance, hashes, geography, units, HTTP, and validation helpers.
- **data/data/raw/** — acquired source snapshots when present locally; preserve these as evidence and do not overwrite them.
- **data/data/processed/** — city features, geographic/intermediate outputs, reference records, and manifests.
- **data/releases/** — immutable mock, verified, reference-display, and simulation-profile JSON releases.
- **data/audits/** — source and normalization audit outputs.
- **config/** — versioned ranking, reference, and simulation configuration.
- **tests/** — Python tests for data, contracts, ranking, and simulation; apps/web/tests contains browser tests.
- **docs/** — detailed architecture, data sources, methodology, simulation, contracts, verification, and demo notes.

## Where the data comes from

The active ranking release uses public sources. Each measurement includes units and provenance that identifies the source, period, source and target geography, transformation, assumptions, retrieval time, and raw-file SHA-256 where available.

| Source | Role in the current project |
|---|---|
| [U.S. Census ACS 2024 five-year estimates](https://www.census.gov/programs-surveys/acs/data.html) | Population, household vehicle availability, commute mode, and commute duration. The verified.v2 release uses official table-based Summary File inputs, including estimates and margins of error. |
| [U.S. Census TIGER/Line 2024](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html) | Official CBSA and county geographies, county land area, and county road-edge snapshots used for metro-level road proxies. |
| [NOAA NCEI 1991–2020 Climate Normals](https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals) | Precipitation, snowfall, and annual days with maximum temperature at least 90°F. Station values serve as climate proxies for metro areas. |
| [U.S. DOE Alternative Fuels Data Center, NLR API](https://afdc.energy.gov/data_download) | Current-snapshot operational public DC fast-charging stations and reported port counts. |
| [Waymo public ride-service locations page](https://waymo.com/rides/) | Dated evidence for whether configured reference markets appeared under “Serving Riders In” or “Up Next.” |
| [Rhode Island Statewide Planning RISM 2015 high-employment-zone layer](https://risegis.ri.gov/hosting/rest/services/RIDOA/ESTIP_Geoprocessing/MapServer/7) | Optional Providence simulation location weights. This is a public model output, not observed ride-hailing demand. |
| [City of Providence public GIS building and road layers](https://pvdgis.maps.arcgis.com/home/item.html?id=d66b8deed2614d54b18906ba1f532030) | Providence scene and display paths for playback. They do not drive dispatch, simulated travel time, or operating metrics. |
| [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/guides/) | Browser map tiles and 3D map presentation. It does not supply ranking data or run the simulator. |

The repository also has adapters or scaffolding for sources such as LODES, FARS, OpenStreetMap, transit, airports, FRA crossings, NGSIM, WZDx, and the Waymo Open Motion Dataset. Their presence in the repo does not mean their measurements are included in ranking.v2. FARS crash context is currently unpublished and unvalidated.

### Market geography

Markets are Census Core Based Statistical Areas (CBSAs), not city-proper boundaries. The pipeline resolves configured labels against official TIGER/Line CBSA records. It assigns whole counties to CBSAs using county representative points, handles multi-state metros through their county membership, and sums Census county land area. Population density uses land area and excludes water.

The release uses canonical API IDs such as **cbsa:39300**. Source pipeline files may use the five-digit code without the prefix. A Census representative point provides a consistent location for station-proxy selection and map markers; it is not a population-weighted center.

### Active ranking features

The ranking.v2 registry has 15 required measurements. Feature weights below are within each pillar; the pillar weights are Familiarity 40%, Readiness 20%, and Opportunity 40%.

| Pillar | Feature | Within-pillar weight | Source and derivation | Transform |
|---|---|---:|---|---|
| Familiarity | **annual_precipitation_mm** | 10% | 1991–2020 NOAA annual precipitation normal; nearest reporting station proxy. | log1p |
| Familiarity | **annual_snowfall_mm** | 10% | 1991–2020 NOAA annual snowfall normal; nearest reporting station proxy. | log1p |
| Familiarity | **hot_days_32c** | 10% | Mean annual days with maximum temperature at least 90°F from qualifying NOAA stations. | linear |
| Familiarity | **mean_commute_minutes** | 20% | ACS aggregate commute minutes divided by workers outside the work-from-home universe. | linear |
| Familiarity | **road_density_km_per_km2** | 10% | Included TIGER/Line drivable-road edge km divided by CBSA land km². | log1p |
| Familiarity | **intersection_density_per_km2** | 10% | Consolidated network junctions per CBSA land km². | log1p |
| Familiarity | **freeway_share** | 10% | Freeway and ramp edge length divided by included road-edge length. | linear |
| Familiarity | **arterial_share** | 10% | Arterial edge length divided by included road-edge length. | linear |
| Familiarity | **local_road_share** | 10% | Local, service, and alley edge length divided by included road-edge length. | linear |
| Readiness | **public_dc_ports_per_100k** | 70% | Qualifying public, operational AFDC DC fast ports per 100,000 residents. | log1p |
| Readiness | **population_share_in_counties_with_dc** | 30% | CBSA population in member counties with at least one qualifying DC port, divided by CBSA population. | linear |
| Opportunity | **population** | 30% | ACS resident population. | log1p |
| Opportunity | **population_density_per_km2** | 25% | ACS population divided by CBSA land km². | log1p |
| Opportunity | **zero_vehicle_household_share** | 30% | Households with no available vehicle divided by all households. | linear |
| Opportunity | **transit_commute_share** | 15% | ACS public-transit commuters divided by the applicable worker universe. | linear |

Two other road fields, average_aadt and lane_miles_per_km2, may appear as missing informational measurements. They are not part of ranking.v2 and do not affect completeness or scores. Full source definitions are in config/ranking.v2.json.

Two other road fields, average_aadt and lane_miles_per_km2, may appear as missing informational measurements. They are not part of ranking.v2 and do not affect completeness or scores.

## Data engineering: from source files to ranked metros

The build pipeline is offline and separates original inputs from derived outputs.

1. **Acquire and preserve.** Dataset modules fetch official files or API responses into data/data/raw/. Downloaded inputs are not silently replaced with sample data. Processing records the source URL, dataset, period, hash, and retrieval metadata.
2. **Load and clean.** Source adapters normalize column names and geography identifiers, parse numeric values, validate allowed status and access fields, remove duplicate station records, and reject conflicting duplicates, invalid sentinels, non-finite numbers, and unusable source rows. Unit conversion is explicit. Missing or invalid source data remains missing with a reason.
3. **Join to CBSA geography.** Census boundaries and county membership provide the join key. ACS county values and charging locations are mapped through county/CBSA relationships. Road snapshots must cover all member counties before complete network features are emitted; partial road networks are not treated as full networks.
4. **Engineer features.** ACS numerators and denominators are combined before ratios are calculated. In verified.v2, mean commute time is aggregate travel minutes divided by workers who did not work from home, using B08013_E001 / B08303_E001. Zero-vehicle share uses zero-vehicle households divided by all households. Transit share uses transit commuters divided by the applicable worker universe. Density divides population by Census land area.
5. **Build road and climate proxies.** TIGER road-edge lengths are projected before measurement and grouped by Census MTFCC classes. Intersections use distinct topological endpoints with degree at least three; nearby nodes are consolidated and artificial boundary ends are excluded. NOAA precipitation and snowfall use the nearest reporting station within 100 km; hot-day counts average qualifying stations within that radius. NOAA blank, sentinel, or disallowed values are not turned into zeros.
6. **Validate and export.** City records are checked against the Pydantic CityFeature contract. Populated values need provenance links. The exporter checks candidate/reference membership and required fields, freezes ranking bounds, validates the release, and refuses to overwrite a different release file.

The current verified.v2 release has complete ranking measurements for its 20 configured candidates and 15 enabled references. The 35 records form its normalization cohort. That is full coverage of this configured set, not nationwide metro coverage. The verified.v2 correction audit reuses hash-matched prior evidence for sources unchanged from verified.v1; an independent full replay requires the original raw-source archive.

### Rebuild commands

From the repository root, install dependencies:

    uv sync --frozen
    npm --prefix apps/web ci

To download available public inputs and build processed city features:

    uv run python -m src.pipeline.run_all --download --process

To process already-preserved inputs without downloading:

    uv run python -m src.pipeline.run_all --process

To create a new immutable verified release file, choose a new output name:

    uv run python -m src.pipeline.export_release --output data/releases/verified.next.json

The exporter defaults to verified.v1.json and will not overwrite different bytes at an existing release path. A new release should receive a new version, source audit, and review before deployment. Fresh AFDC acquisition requires NREL_API_KEY. ACS can use a Census API key when available; the official Summary File path is available without one. Failures in numeric source acquisition leave measurements explicitly missing and can prevent a release from passing rankability gates. Missing or ambiguous Waymo market status fails reference construction.

The correction command for the committed verified.v2 release is:

    uv run --with-editable ./data python -m src.pipeline.correct_release --download

This command downloads the two ACS source tables needed for the documented commute correction. See docs/data-sources.md for what it verifies and which original source archives are still needed for a full replay.

## How ranking and normalization work

The engine is deterministic. It uses the feature registry and bounds stored in the selected immutable release; it does not refit min/max values for each request.

### Normalize measurements

For each feature, the build process applies its configured transform, either linear or log1p. It calculates a minimum and maximum from the transformed values in the complete normalization cohort. At runtime it maps a city value to:

    normalized = (transformed value - frozen minimum) / (frozen maximum - frozen minimum)

Values are clipped to the [0, 1] interval. A feature with identical lower and upper bounds across the cohort is constant and removed from scoring for every city. A feature outside the original release range remains bounded by clipping; filtering candidates or changing weights never changes the stored bounds.

A candidate must have all 15 ranking.v2 measurements to receive a score. There is no imputation and no city-specific redistribution of feature weights. Incomplete candidates remain visible as unranked with reasons. Enabled references must also be complete. Missing is never treated as zero.

### Build pillar and total scores

- **Familiarity:** the engine compares a candidate’s normalized nine-feature vector with each selected reference vector. It finds the nearest whole reference using weighted Euclidean distance and converts distance to similarity on a 0–100 scale. It does not mix the best feature from one city with the best feature from another.
- **Readiness:** a weighted average of the candidate’s normalized public charging measures, scaled to 0–100.
- **Opportunity:** a weighted average of the candidate’s normalized population and mobility proxies, scaled to 0–100.
- **Expansion score:** the weighted average of the three pillar scores using the selected pillar weights. Default ranking.v2 weights are 40/20/40. Ties sort by full-precision score and then city ID.

A score is relative to its data release and model version. Display rounding can hide small differences. Scores across different releases are not directly comparable.

### How the Waymo reference set is grounded

The configured reference list contains Phoenix, San Francisco Bay Area, Los Angeles, Austin, Atlanta, Dallas, Denver, Houston, Miami, Nashville, Orlando, San Antonio, San Diego, Tampa, and Las Vegas.

The pipeline captures Waymo’s public locations page and looks for the exact configured city/state label in the page’s “Serving Riders In” and “Up Next” sections. A “Serving Riders In” match is classified as commercial and enabled. An “Up Next” match is classified as announced and disabled for default ranking. If the label is absent or appears ambiguously, the build fails instead of inferring status. The listed market is then resolved to an official Census CBSA. The release retains the page snapshot’s provenance and retrieval date.

In verified.v2 all 15 configured references are enabled and recorded as commercial as of September 26, 2026. This makes the reference roster traceable to Waymo’s own public market list at that snapshot. It does **not** establish accuracy against Waymo’s internal city-selection logic: this project has no access to that model, labels beyond the public list, outcome data, training set, or calibration benchmark. The similarity score says how close a candidate is to a selected reference on these 9 public features. It is not a forecast of launch likelihood, operating performance, or safety.

The ranking.v2 candidate set is Jacksonville, Columbus, Indianapolis, Milwaukee, Memphis, Louisville, Oklahoma City, El Paso, Albuquerque, Kansas City, Cincinnati, Cleveland, Raleigh, Virginia Beach, Richmond, Salt Lake City, Birmingham, Tulsa, Providence, and Hartford.

## How the fleet simulation works

The simulator models hypothetical service operations in a synthetic zone. It does not simulate autonomous driving or consume the ranking score to dispatch vehicles. The selected city ID provides request validation and scenario context; the operational engine uses its request, simulation assumptions, seed, and optional demand profile.

### Demand and location data

The default synthetic-zone.v1 profile assumes 1,000 requests per day. It applies 24 relative hourly weights, then samples a Poisson request count for each hour. Request times are uniform within the hour. Pickup and dropoff locations are uniform by area inside a hypothetical five-mile-radius disk. The API defaults to 50 vehicles, seven days, demand multiplier 1, fares of $3 base + $1.75 per mile + $0.30 per passenger minute, and seed 42. Separate seeded random streams keep generated requests stable when fleet size or fares change. The same hourly curve repeats each day; there is no local demand calibration, weekday/weekend variation, fare elasticity, weather, or traffic effect.

Providence can use the optional providence-rism-2015.v1 profile. It covers 86 public 2015 Rhode Island Statewide Model high-employment zones marked as Providence, totaling about 13.69 square miles. The profile uses modeled trip production to weight pickup-zone selection and modeled attraction to weight dropoff-zone selection. Each zone has 32 reproducible sample points inside its polygon. These values provide spatial weights only; request volume and hourly timing remain assumptions. The source does not cover all of Providence municipality or the Providence-Warwick CBSA, and its trips are not observed ride-hail or Waymo trips.

### Event engine and fleet rules

A seeded discrete-event engine orders request, travel-completion, charging, and vehicle-state events in a priority queue. Same-time events use stable priority and sequence ordering. A vehicle starts idle with a full assumed 250-mile battery.

At each request, the engine considers idle vehicles and chooses the nearest one that can reach pickup within 15 minutes and has enough battery for pickup travel, passenger travel, return to the assumed depot, and a 10% reserve. Travel time uses Euclidean distance multiplied by 1.3 and an assumed 20 mph speed. There is no real street routing, traffic, queue of waiting passengers, or vehicle physics. Requests are rejected immediately when no vehicle is feasible.

Vehicles charge at an assumed private depot. Chargers are calculated as one per ten vehicles, rounded up, with at least one charger. Charging begins at 20% battery and targets 80%, at an assumed 2.5 range-miles per minute. A finite first-in, first-out queue models charger contention. Public charging data in the market ranking does not set depot charger count or availability.

The Providence profile also enables simulation.v2’s assumed idle-cruising policy. When available, vehicles may travel between nearby model-zone waypoints at an assumed 12 mph. Legs target 0.25–1.2 local miles, are weighted by modeled 2015 trip production, and use a separate seeded stream. Cruising consumes battery and counts as empty mileage. It is a scenario assumption, not observed fleet behavior or an optimizer. The synthetic profile retains its original stationary-idle behavior.

### Simulation outputs

The engine returns total and hourly requests, completed, rejected, and unfinished rides; mean and p95 pickup wait for completed rides; utilization; passenger and empty miles; empty-mile share; charging and charging-queue vehicle-hours; gross fare revenue; and rides/revenue per vehicle. Requests are conserved across completed, rejected, and unfinished totals. Travel, service, and accounting are clipped to the requested simulation window. Passenger miles include in-window travel on unfinished rides; wait statistics cover completed rides only. Revenue is recognized when a ride completes and excludes all operating costs, so it is not profit.

Vehicle playback is optional and is generated from the same event sequence as the metrics. The web client interpolates returned segments for animation. For Providence, Mapbox can display those endpoints against bundled road geometry; the drawn road path is presentation only, while the engine metrics use the stated distance assumptions. Other synthetic scenarios use local coordinates and do not claim a real service boundary.

The request accepts fleet size 1–200, duration 1–7 days, demand multiplier 0–5, bounded fares, and a 32-bit seed. The engine refuses more than 100,000 generated requests and limits playback to 10,000 requests. Simulation IDs hash the resolved inputs, assumptions, release versions, and selected spatial artifact so a repeat request can be identified.

## Technology stack and APIs

| Layer | Technology |
|---|---|
| Web application | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Charts and geography | Recharts, d3-geo, Mapbox GL JS loaded by the browser |
| Backend | Python 3.12, FastAPI, Uvicorn, Pydantic 2 |
| Ranking and simulation | NumPy for seeded random generation and numeric work; pure Python event/ranking logic |
| Data engineering | pandas, GeoPandas, Shapely, pyproj, pyshp, pyarrow, httpx/requests |
| API contract tooling | Pydantic → OpenAPI → openapi-typescript generated TypeScript declarations |
| Deployment definitions | Vercel for apps/web and Render for the Python API |

The web client defaults to an API origin of http://localhost:8000. Configure NEXT_PUBLIC_API_BASE_URL for a hosted API, NEXT_PUBLIC_DATA_TRANSPORT=http for HTTP mode, and NEXT_PUBLIC_MAPBOX_TOKEN for Mapbox. A labeled map fallback appears without a valid Mapbox token. Frontend NEXT_PUBLIC variables are public and must not contain source or server secrets.

Optional backend GEMINI_API_KEY enables a constrained Gemini 2.5 Flash rewrite of a verified-data explanation summary. The deterministic calculation and evidence stay server-owned. If the key is missing or the upstream response fails validation, the deterministic template is returned.

### Application API

FastAPI exposes interactive OpenAPI documentation at /docs when the service is running.

| Method and route | Purpose |
|---|---|
| GET /health | Service health and active release versions. |
| GET /api/v1/config | Feature registry, frozen bounds, enabled references, default weights, simulation defaults, and exclusions. |
| GET /api/v1/cities | Candidate city summaries and version metadata. |
| GET /api/v1/cities/{city_id} | Full city measurements, legal evidence, and provenance. |
| POST /api/v1/rankings | Rank candidate cities with selected references and pillar weights. |
| POST /api/v1/reference-rankings | Rank a requested subset of configured reference cities. |
| POST /api/v1/waymo-reference-rankings | Rank the dedicated Waymo reference-market set. |
| POST /api/v1/cities/{city_id}/explanation | Explain a candidate ranking from calculated factors and evidence. |
| POST /api/v1/waymo-reference-cities/{city_id}/explanation | Explain one city in the Waymo reference comparison. |
| POST /api/v1/simulations | Run a hypothetical candidate-market scenario. |
| POST /api/v1/waymo-reference-simulations | Run the synthetic-profile scenario for an enabled Waymo reference city. |

Errors use a structured error object. Invalid input returns 422, an unknown city returns 404, request or playback limits return 413, a busy simulation service returns 429, and an unavailable pinned Providence artifact returns 503.

Ranking and simulation endpoints calculate on the server. The API returns factors, reference matches, exclusions, source IDs, assumptions, simulation metrics, and optional playback segments for the interface to render.

## Run locally

Requirements: Python 3.12, uv, Node.js 22, and npm. A Mapbox public token is optional for the map experience.

Install from the repository root:

    uv sync --frozen
    npm --prefix apps/web ci

Start the API in one terminal:

    uv run uvicorn odd_scout.api.main:app --reload --port 8000

Start the frontend in another terminal:

    npm --prefix apps/web run dev

Open http://localhost:3000. API docs are at http://localhost:8000/docs. The mock demo needs no Census, AFDC, Waymo, or Gemini credentials. Windows users may need python -m uv and npm.cmd.

To run the verified.v2 data file locally, set these variables in the shell that starts the API:

    ODD_DATA_MODE=verified
    ODD_DATA_RELEASE=data/releases/verified.v2.json

For PowerShell, set them with:

    $env:ODD_DATA_MODE = "verified"
    $env:ODD_DATA_RELEASE = "data/releases/verified.v2.json"

The frontend can use committed response fixtures for an offline, read-only demonstration by setting NEXT_PUBLIC_DATA_TRANSPORT=fixtures. Fixture mode replays default results; it does not recalculate changed weights or simulation inputs. HTTP mode calls the Python API for live calculations.

## Verification and generated contracts

The Pydantic models are canonical. After a contract change, export OpenAPI and regenerate web declarations; never hand-edit generated API types.

    uv run python -m contracts.export
    npm --prefix apps/web run generate:api

Project verification commands:

    uv run pytest
    npm --prefix apps/web run typecheck
    npm --prefix apps/web run build
    npm --prefix apps/web exec -- playwright install chromium
    npm --prefix apps/web run test:e2e

See docs/verification.md for recorded evidence, deployment checks, and known performance limits.

## Further documentation

- [Architecture](docs/architecture.md)
- [Data sources and ingestion](docs/data-sources.md)
- [Ranking methodology](docs/methodology.md)
- [Fleet simulation](docs/simulation.md)
- [API contracts](docs/contracts.md)
- [Demo runbook](docs/demo-runbook.md)
- [Decisions](docs/decisions.md)
- [Verification status](docs/verification.md)
