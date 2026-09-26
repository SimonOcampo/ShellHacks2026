# Data sources and ingestion

## Current status

The only committed release is `mock.v1`. Its ranking measurements are synthetic. A local, uncommitted `data/releases/verified.v1.json` artifact now exists and passes canonical release and ranking eligibility checks; the source-verification status below must be reviewed before selecting it for a deployment.

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

The current local release has complete scoring measurements for 20 candidate CBSAs and 15 enabled commercial references. Missing or incomplete sources remain explicit; the pipeline does not provide imaginary data fallbacks. The reproducible source audit is `python -m src.pipeline.verify_release_sources` and its output is `data/audits/verified-source-checks.json`.

## Local release verification, 2026-09-26

`data/releases/verified.v1.json` is an immutable local artifact with SHA-256 `e5099e4612908ced11403498afd6ab62953a44c0b1777c2ef0a19b51dfe737c6`. The default `RankingResult.ranking_id` is `93edf127d62f0d427f2d`. The canonical `DataRelease` validator and publisher rankability gate pass: 20 ranked candidates, zero unranked candidates, 15 enabled references, and a 35-city frozen normalization cohort. The source audit independently recalculates all 15 transformed feature bounds from that cohort. Re-running the exporter against the current processed JSON leaves the release byte-for-byte unchanged. The local suites pass with 21 ranking tests and 31 data tests. This is local proof, not a deployed API or remote CI result.

The source audit checks 220 retained raw snapshot hashes; 270 removed road ZIPs retain hashes and are marked `retained=false`. All 875 release provenance records resolve to manifest hashes. NOAA's official access service was queried with `units=standard` and `includeAttributes=true` for all 115 stations used by the release. All 175 selected annual-normal observations matched the original saved values and the processed unit conversions. Measurement flags were blank; completeness flags were 58 standard, 76 representative, 29 provisional, and 12 estimated. The audit also checks all 105 city-feature station choices against the preserved 9,212-station inventory. Ten closer stations that lacked original snowfall responses were queried again; none reports a snowfall normal, so the saved choices remain the nearest reporting stations. These lower-completeness classifications remain visible limitations of the station proxies. NOAA's [annual/seasonal documentation](https://www.ncei.noaa.gov/pub/data/cdo/documentation/normals-annualseasonal-1991-2020_documentation.pdf) defines those flags, standard-unit inches for precipitation and snowfall, and missing sentinels.

The AFDC raw snapshot contains 82,340 unique station IDs. Independent filtering found 15,592 public operational DC sites nationwide; 4,182 fall in the configured CBSAs, totaling 24,739 reported DC ports. Independent spatial joins to the 2024 CBSA and county polygons matched every stored station assignment. Port rates and county-population coverage matched every city. The processing adapter now deduplicates station IDs and rejects conflicting duplicate records. The 15 reference categories and enabled states match the preserved official Waymo page; their status date is 2026-09-26.

All 35 ACS CBSA estimates used for population, vehicle access, and transit shares match the saved 2024 five-year Summary File. Its related MOE columns are present. Census encodes the controlled total-population MOE as `-555555555` for all 35 CBSAs; the auditor records it as controlled, not a numeric MOE. The 30 summary-file aggregate-commute estimates have reported MOEs. The saved profile extract used for Birmingham, El Paso, Memphis, Raleigh, and Tulsa contains `DP03_0025E` estimates but no `DP03_0025M` values. The keyless Census profile endpoint currently returns a Missing Key page, so those five exact commute MOEs remain unverified. The mixed profile-versus-summary commute method also limits direct comparisons. Census documents that the [table-based Summary File](https://www.census.gov/programs-surveys/acs/data/summary-file.html) carries estimates and MOEs together and that [controlled estimates use a special MOE marker](https://www.census.gov/data/developers/data-sets/acs-1year/data-notes.html).

The immutable `verified.v1` release also cites the retired `developer.nrel.gov` AFDC hostname in its provenance, while the saved snapshot was acquired from `developer.nlr.gov`. The pipeline now uses the current host for future exports. Do not rewrite `verified.v1`; publish a new versioned release after the profile MOEs and commute-method decision are resolved. These three items prevent a full source-publication signoff for `verified.v1`.

## Source conventions

**ACS:** [2024 five-year data](https://www.census.gov/programs-surveys/acs/data.html). B01003 population; B08201 household vehicle availability; B08301 commute mode; B08303 commute duration. Acquisition requests estimates and margins of error. Use one matching vintage across metro and county denominators.

Commute bin midpoint assumptions: 2.5, 7, 12, 17, 22, 27, 32, 37, 42, 52, 74.5, and 105 minutes. The >=90-minute bin uses 105 minutes. This is a derived grouped estimate, not an official exact mean.

**NOAA:** [1991–2020 normals](https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals). Query standard units and quality attributes; reject invalid reported values or flags. Precipitation and snowfall each use the nearest reporting station within 100 km of the CBSA representative point. Hot days average up to three qualifying stations within 100 km. Record station IDs and distances. Missing snowfall is never interpreted as zero.

**Charging:** [AFDC](https://afdc.energy.gov/data_download), current NLR API. Filter fuel ELEC, public access, operational status E. Deduplicate station IDs. Missing DC counts invalidate the feature rather than understating capacity. Join points to frozen county geometry. County populations must reconcile with the metro population basis.

**Reference evidence:** dated public operator or transport-agency pages. Store operator and commercial/announced/testing category separately. Candidate research references: Phoenix, San Francisco, Los Angeles, Austin, Atlanta. No current status is inferred from fixture data.

**Map:** bundled illustrative U.S. state GeoJSON from [PublicaMundi MappingAPI](https://github.com/PublicaMundi/MappingAPI/blob/master/data/geojson/us-states.json). It is display-only, not the scoring geography. Preserve its upstream attribution; do not use it for CBSA joins.

## Provenance

Each measurement links IDs to records containing source name, public URL, dataset ID, period, retrieval date, source/target geography, transformation, assumptions, and raw SHA-256. Legal and reference facts also require evidence IDs. Keep units in the feature registry and validate every release against it.

## Promotion and rollback

After successful verified publication, set `ODD_DATA_MODE=verified` and `ODD_DATA_RELEASE` to its path. Startup refuses a mismatch or fewer than eight ranked candidates. Keep the previous release and deployment. Roll back by selecting the previous matching mode/path; never rewrite historical raw files.
