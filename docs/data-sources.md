# Data sources and ingestion

## Current status

The only committed release is `mock.v1`. Every ranking measurement is synthetic, with synthetic provenance. Marker coordinates are approximate, and fixture official names are explicitly placeholders. No public-source URL is attached to invented measurements.

During implementation, the Census API returned a Missing Key page. The old AFDC `developer.nrel.gov` hostname failed DNS, while `developer.nlr.gov` returned the public station API successfully. No Census or AFDC secret was available in the local environment. NHTSA access was previously blocked during planning. Do not claim verified data coverage from these access probes.

## Offline pipeline

1. Acquire official raw snapshots; never fetch on page load.
2. Preserve bytes under content-hashed filenames in `data/raw`.
3. Record safe URL, dataset, query excluding credentials, period, retrieval time, geography, license notes, hash, and file location in `data/manifests`.
4. Transform through source adapters. Retain source variable IDs and uncertainty metadata in the prepared record's provenance/assumptions.
5. Harmonize to a frozen CBSA vintage.
6. Assemble canonical CityFeature records and dated reference evidence.
7. Freeze normalization across complete candidates/references.
8. Publish an immutable, validated release with at least eight ranked candidates.

```sh
uv run python -m adapters.acquire acs
uv run python -m adapters.acquire afdc
uv run python -m adapters.acquire noaa --station USW00012839
uv run python -m adapters.publish prepared-release.json data/releases/verified.v1.json
```

Acquisition retries preserve existing content-addressed bytes and manifests. Publisher validates raw evidence hashes, refuses overwrite with changed content, and uses an atomic final rename. Repeating identical publication is a no-op. Failures remain explicit. Changing source meaning requires a new feature/model version, not a silent adapter swap.

`prepared-release.json` follows DataRelease with CityFeature records; `bounds` and `normalization_cohort` are recomputed by the publisher. No prepared official bundle is provided yet. The adapters expose these pure transforms:

- `acs_features(row, land_area_km2)`: table-specific estimates to five canonical features.
- `noaa_features(decoded_stations, latitude, longitude)`: three complete nearest stations within 100 km, or an error.
- `charging_features(joined_stations, county_populations, metro_population)`: operational public DC counts and county coverage.

The remaining data work is official geography acquisition, ACS credential-backed acquisition, NOAA product decoding, point-in-polygon joining, reference-status research, and assembly of the verified bundle. These are not implemented as imaginary data fallbacks. An AFDC snapshot of 82,340 records and a Miami NOAA station CSV were acquired with committed manifests; their raw bytes remain ignored locally. These partial sources do not establish a verified leaderboard.

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
