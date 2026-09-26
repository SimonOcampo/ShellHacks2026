# Data sources and ingestion

## Current status

The only committed release is `mock.v1`. Every ranking measurement is synthetic, with synthetic provenance. Marker coordinates are approximate, and fixture official names are explicitly placeholders. No public-source URL is attached to invented measurements.

During implementation, the Census API returned a Missing Key page. The old AFDC `developer.nrel.gov` hostname failed DNS, while `developer.nlr.gov` returned the public station API successfully. No Census or AFDC secret was available in the local environment. NHTSA access was previously blocked during planning. Do not claim verified data coverage from these access probes.

## Offline pipeline

The implemented source pipeline builds internal city records from saved public snapshots. It keeps raw data separate from processed values, records provenance, and does not fetch data on page load. Internal IDs use bare five-digit CBSA codes. The release boundary converts them to the canonical API form `cbsa:<code>`.

```sh
uv run python -m src.pipeline.run_all --download --process
uv run python -m src.pipeline.export_release
```

The exporter reads `data/processed/cities/all_city_features.json`, the dated reference-market records, and `config/ranking.v2.json`. It uses the canonical `packages/contracts/models.py` models, freezes transformed bounds across complete candidates and enabled references, and refuses to overwrite a different output file. It requires complete enabled references and at least eight complete ranked candidates. A pipeline run that cannot pass these gates leaves the runtime's current mock release unchanged.

To inspect current processed data without publishing, run `uv run python -m odd_ranking.publish_v2`. It writes `data/audits/ranking.v2-normalization.json`, an audit-only artifact with cohort IDs, transformed bounds, missing and invalid measurement details, provenance links, and per-city raw-to-normalized rows. It also traces one candidate and one reference through the ranking engine. The audit command does not rewrite processed city files or release files.

Release export fails closed when a measurement has a numeric value but is marked missing, carries a missing reason, or lacks provenance. Audit-only handling treats such a measurement as unavailable in its in-memory release copy, retains the original numeric source value in the audit, and excludes the record under complete-case policy. It never rewrites that processed measurement.

The active registry has 15 required ranking measurements. `average_aadt` and `lane_miles_per_km2` are optional informational fields and do not enter scoring. If present but unavailable, they carry a null value and explicit missing reason. Missing scoring measurements remain incomplete; they are never imputed.

The source adapters expose these pure transforms:

- `acs_features(row, land_area_km2)`: table-specific estimates to five canonical features.
- `noaa_features(decoded_stations, latitude, longitude)`: three complete nearest stations within 100 km, or an error.
- `charging_features(joined_stations, county_populations, metro_population)`: operational public DC counts and county coverage.

The remaining release work is to pass completeness and provenance gates with official geography, ACS, NOAA, AFDC, and dated reference inputs. Missing or incomplete sources remain explicit; the pipeline does not provide imaginary data fallbacks. An AFDC snapshot and NOAA station data are available locally, but partial sources do not establish a verified leaderboard.

## Source conventions

**ACS:** [2024 five-year data](https://www.census.gov/programs-surveys/acs/data.html). B01003 population; B08201 household vehicle availability; B08301 commute mode; B08303 commute duration. Acquisition requests estimates and margins of error. Use one matching vintage across metro and county denominators.

Commute bin midpoint assumptions: 2.5, 7, 12, 17, 22, 27, 32, 37, 42, 52, 74.5, and 105 minutes. The >=90-minute bin uses 105 minutes. This is a derived grouped estimate, not an official exact mean.

**NOAA:** [1991–2020 normals](https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals). Read each product's scale factors and quality flags before converting. Stations must have all three selected variables. Use equal weights across up to three stations within 100 km of the principal-city marker. Record station IDs and distances. Missing snowfall is never interpreted as zero.

**Charging:** [AFDC](https://afdc.energy.gov/data_download), current NLR API. Filter fuel ELEC, public access, operational status E. Deduplicate station IDs. Missing DC counts invalidate the feature rather than understating capacity. Join points to frozen county geometry. County populations must reconcile with the metro population basis.

**Reference evidence:** dated public operator or transport-agency pages. Store operator and commercial/announced/testing category separately. Candidate research references: Phoenix, San Francisco, Los Angeles, Austin, Atlanta. No current status is inferred from fixture data.

**Map:** bundled illustrative U.S. state GeoJSON from [PublicaMundi MappingAPI](https://github.com/PublicaMundi/MappingAPI/blob/master/data/geojson/us-states.json). It is display-only, not the scoring geography. Preserve its upstream attribution; do not use it for CBSA joins.

## Provenance

Each measurement links IDs to records containing source name, public URL, dataset ID, period, retrieval date, source/target geography, transformation, assumptions, and raw SHA-256. Legal and reference facts also require evidence IDs. Keep units in the feature registry and validate every release against it.

## Promotion and rollback

After successful verified publication, set `ODD_DATA_MODE=verified` and `ODD_DATA_RELEASE` to its path. Startup refuses a mismatch or fewer than eight ranked candidates. Keep the previous release and deployment. Roll back by selecting the previous matching mode/path; never rewrite historical raw files.
