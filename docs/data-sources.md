# Data sources and ingestion

## Current status

The runtime still defaults to synthetic `mock.v1`. The immutable `verified.v1` artifact is retained as a historical release. The corrected `data/releases/verified.v2.json` closes its three publication gaps using fresh Census evidence and the hash-matched prior audit for unchanged sources. It has 20 ranked candidates and 15 enabled references. It has passed local API validation but has not been selected on Render.

## Corrected release, 2026-09-26

`verified.v2` has SHA-256 `8533f5fec66352797963cd41a23430642bac6ad0ff0a50569449d013a9445df6` and default ranking ID `e1e3650e5a6a13ca8a48`. Its data version ends in `__commute-B08013-B08303-r2`; the scoring registry remains `ranking.v2`.

Every candidate and reference now uses 2024 ACS `B08013_E001 / B08303_E001`. Both universes are workers age 16 and over who did not work from home. This also fixes the old summary calculation, which divided aggregate travel minutes by all workers, including home workers. All 35 CBSAs have both input estimates and both reported margins of error. There is no profile fallback or mixture of commute methods. Input MOEs are recorded in `data/audits/verified.v2-source-checks.json`; they are not a calculated confidence interval for the ratio or score. Unrounded ratios can differ from rounded Census profile means.

All AFDC provenance URLs in the new release use `developer.nlr.gov`. Charging measurements, raw hashes, and retrieval dates remain identical to the parent. Normalization bounds were recalculated and frozen for the same 35-city cohort. No other measurement, ranking formula, or reference category changed. The original release bytes remain untouched.

Verification is incremental: the new audit binds the exact parent release, parent audit, parent manifest, and new source files by SHA-256. Existing checks for unchanged ACS demographics, NOAA, charging, geography, and reference evidence are reused from Developer 1's recorded audit. This is not a fresh full replay of the original raw bundle. The old processed city JSON and workbook remain the historical inputs to `verified.v1`; the correction command derives `verified.v2` directly from that immutable release. A future full summary-file build uses the corrected commute transformation as well.

To reproduce the correction or validate an identical existing output from the repository root:

```sh
uv run --with-editable ./data python -m src.pipeline.correct_release --download
```

Only two official Census tables are downloaded (about 79 MB combined). Large raw files do not belong in Git and are not required by the API. Retain the original raw/intermediate archive outside Git if a full independent source replay is required. The correction audit includes the 35 selected observations, both input MOEs, source URLs, and hashes. NOAA's lower-completeness station proxies and removed historical road ZIPs remain documented limitations; no new road or climate claims are made.

Local verification passed 78 backend/data tests, with two existing optional tests skipped. Two separate full-source replay tests require the unavailable original raw bundle; they were excluded from the passing run, not counted as passed. The seven API endpoints also passed with the new release, including a request-conserving seven-day simulation. See `docs/verification.md` for commands and results.

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

Both historical `verified.v1` and corrected `verified.v2` have complete scoring measurements for 20 candidate CBSAs and 15 enabled commercial references. Missing or incomplete sources remain explicit. The full raw-replay auditor is `python -m src.pipeline.verify_release_sources`; use an explicit `--release` and distinct `--output` when auditing a new version. It requires the original raw/intermediate bundle. The incremental correction command above requires only the two new ACS tables.

`verified.v2` ranks all 20 CBSAs named in `config/ranking.v2.json`: there are no unranked configured candidates and its release `exclusions` list is empty. This confirms coverage of the selected candidate set, not nationwide metro coverage. Other CBSAs were not evaluated by this release. The 15 enabled reference metros belong to the normalization cohort, not the candidate ranking. Both optional road measurements, `average_aadt` and `lane_miles_per_km2`, are missing for all 20 candidates and excluded from scoring. Feature coverage means presence of required measurements, not source precision or score confidence. The ACS commute audit retains input margins of error but does not calculate uncertainty for the ratio or final score; NOAA station normals have documented proxy and quality limits. A full independent replay of inherited source checks still needs the off-repository raw bundle.

Crash context remains unvalidated and unpublished. The repository has a FARS downloader and spatial-join adapter, but its manifest and `verified.v2` contain no FARS raw snapshot, event counts, or denominator series. Before reporting any CBSA crash count or rate, verify the official NHTSA release and year, archive its hash, reconcile national and geocoded event totals, and audit invalid coordinates and boundary exclusions. Define a same-year, same-geography exposure denominator and its source before calculating a rate; resident population, road length, and vehicle miles traveled answer different questions and are not interchangeable. Report missing geography and denominator coverage explicitly. Any later crash context must remain unscored and must not imply AV safety or deployment approval.

## Historical verified.v1 verification, 2026-09-26

`data/releases/verified.v1.json` is an immutable local artifact with SHA-256 `e5099e4612908ced11403498afd6ab62953a44c0b1777c2ef0a19b51dfe737c6`. The default `RankingResult.ranking_id` is `93edf127d62f0d427f2d`. The canonical `DataRelease` validator and publisher rankability gate pass: 20 ranked candidates, zero unranked candidates, 15 enabled references, and a 35-city frozen normalization cohort. The source audit independently recalculates all 15 transformed feature bounds from that cohort. Re-running the exporter against the current processed JSON leaves the release byte-for-byte unchanged. The local suites pass with 21 ranking tests and 31 data tests. This is local proof, not a deployed API or remote CI result.

The source audit checks 220 retained raw snapshot hashes; 270 removed road ZIPs retain hashes and are marked `retained=false`. All 875 release provenance records resolve to manifest hashes. NOAA's official access service was queried with `units=standard` and `includeAttributes=true` for all 115 stations used by the release. All 175 selected annual-normal observations matched the original saved values and the processed unit conversions. Measurement flags were blank; completeness flags were 58 standard, 76 representative, 29 provisional, and 12 estimated. The audit also checks all 105 city-feature station choices against the preserved 9,212-station inventory. Ten closer stations that lacked original snowfall responses were queried again; none reports a snowfall normal, so the saved choices remain the nearest reporting stations. These lower-completeness classifications remain visible limitations of the station proxies. NOAA's [annual/seasonal documentation](https://www.ncei.noaa.gov/pub/data/cdo/documentation/normals-annualseasonal-1991-2020_documentation.pdf) defines those flags, standard-unit inches for precipitation and snowfall, and missing sentinels.

The AFDC raw snapshot contains 82,340 unique station IDs. Independent filtering found 15,592 public operational DC sites nationwide; 4,182 fall in the configured CBSAs, totaling 24,739 reported DC ports. Independent spatial joins to the 2024 CBSA and county polygons matched every stored station assignment. Port rates and county-population coverage matched every city. The processing adapter now deduplicates station IDs and rejects conflicting duplicate records. The 15 reference categories and enabled states match the preserved official Waymo page; their status date is 2026-09-26.

All 35 ACS CBSA estimates used for population, vehicle access, and transit shares match the saved 2024 five-year Summary File. Its related MOE columns are present. Census encodes the controlled total-population MOE as `-555555555` for all 35 CBSAs; the auditor records it as controlled, not a numeric MOE. The 30 summary-file aggregate-commute estimates have reported MOEs. The saved profile extract used for Birmingham, El Paso, Memphis, Raleigh, and Tulsa contains `DP03_0025E` estimates but no `DP03_0025M` values. The keyless Census profile endpoint currently returns a Missing Key page, so those five exact commute MOEs remain unverified. The mixed profile-versus-summary commute method also limits direct comparisons. Census documents that the [table-based Summary File](https://www.census.gov/programs-surveys/acs/data/summary-file.html) carries estimates and MOEs together and that [controlled estimates use a special MOE marker](https://www.census.gov/data/developers/data-sets/acs-1year/data-notes.html).

The immutable `verified.v1` release also cites the retired `developer.nrel.gov` AFDC hostname in its provenance, while the saved snapshot was acquired from `developer.nlr.gov`. These three items prevent source-publication signoff for `verified.v1` itself. They are corrected in `verified.v2` above; do not rewrite the historical release.

## Source conventions

**ACS:** [2024 five-year data](https://www.census.gov/programs-surveys/acs/data.html). B01003 population; B08201 household vehicle availability; B08301 commute mode; B08303 commute duration. Acquisition requests estimates and margins of error. Use one matching vintage across metro and county denominators.

For `verified.v2`, commute is the ratio of B08013 aggregate travel minutes to B08303 workers who did not work from home. B08301 remains the denominator for transit mode share, where all workers are the correct universe. No commute bin midpoint approximation is used in this release.

**NOAA:** [1991–2020 normals](https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals). Query standard units and quality attributes; reject invalid reported values or flags. Precipitation and snowfall each use the nearest reporting station within 100 km of the CBSA representative point. Hot days average up to three qualifying stations within 100 km. Record station IDs and distances. Missing snowfall is never interpreted as zero.

**Charging:** [AFDC](https://afdc.energy.gov/data_download), current NLR API. Filter fuel ELEC, public access, operational status E. Deduplicate station IDs. Missing DC counts invalidate the feature rather than understating capacity. Join points to frozen county geometry. County populations must reconcile with the metro population basis.

**Reference evidence:** dated public operator or transport-agency pages. Store operator and commercial/announced/testing category separately. Candidate research references: Phoenix, San Francisco, Los Angeles, Austin, Atlanta. No current status is inferred from fixture data.

**Map:** bundled illustrative U.S. state GeoJSON from [PublicaMundi MappingAPI](https://github.com/PublicaMundi/MappingAPI/blob/master/data/geojson/us-states.json). It is display-only, not the scoring geography. Preserve its upstream attribution; do not use it for CBSA joins.

## Provenance

Each measurement links IDs to records containing source name, public URL, dataset ID, period, retrieval date, source/target geography, transformation, assumptions, and raw SHA-256. Legal and reference facts also require evidence IDs. Keep units in the feature registry and validate every release against it.

## Promotion and rollback

After successful verified publication, set `ODD_DATA_MODE=verified` and `ODD_DATA_RELEASE` to its path. Startup refuses a mismatch or fewer than eight ranked candidates. Keep the previous release and deployment. Roll back by selecting the previous matching mode/path; never rewrite historical raw files.
