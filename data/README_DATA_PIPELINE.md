# ODD Scout Data Pipeline

This package builds reproducible market feature records using official Census CBSA geography, ACS estimates, NOAA climate normals, AFDC public charging sites, and Waymo's public service-market page. It keeps source snapshots, hashes their actual bytes, and validates each exported `CityFeature` against the project's Pydantic v2 contracts. Source datasets that are unavailable are recorded as missing; missing values are never converted to zero.

## Credentials and installation

Create `.env` from `.env.example`. The pipeline downloads official ACS table-based Summary Files without a Census API key; a key enables the alternate API path. AFDC API access uses an NREL/AFDC API key. NOAA annual normals are fetched from public NOAA endpoints without a key.

```text
# Optional (the ACS Summary File path is keyless)
CENSUS_API_KEY=...
# Optional, enables AFDC public charging features
NREL_API_KEY=...
```

Install Python 3.12+ and the declared dependencies:

```bash
py -3.12 -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[test]"
```

## Downloads and rebuilds

Download Census TIGER/Line, ACS, AFDC when configured, and Waymo's public service-market page, then process and validate:

```bash
python -m src.pipeline.run_all --download --process
```

Build selected markets from already saved raw source snapshots:

```bash
python -m src.pipeline.run_all --cities jacksonville columbus indianapolis
```

Download an individual source or build features from existing raw inputs:

```bash
python -m src.datasets.census_geography.download
python -m src.datasets.acs.download --year 2024
python -m src.pipeline.build_city_features --validate
```

The downloader keeps raw files under `data/raw/`; existing snapshots are reused and never overwritten. Raw inputs can be removed after release generation to reclaim disk space; source hashes and provenance remain in the release manifest. A subsequent full rebuild will download missing snapshots again. The data manifest records source paths, hashes, byte sizes, outputs, and warnings.

## CBSA resolution and feature definitions

Candidate display labels and Waymo reference labels are resolved against the official TIGER/Line CBSA name and code. `city_id` is the five-digit CBSA GEOID. County membership uses county representative points against CBSA polygons, so multi-state CBSAs include all their constituent counties. CBSA land area is the sum of Census county `ALAND` values, excluding water. Coordinates are a representative point on the CBSA geometry, not a downtown coordinate.

The ACS 5-Year detailed estimates provide population, household universe/zero-vehicle households, and worker universe/transit commuters. Shares are ratios of the corresponding CBSA numerators and denominators. Census profile `DP03_0025E` supplies mean commute time. Population density is ACS population divided by summed county land area. AFDC DC ports are counted at station coordinates after point-in-CBSA and point-in-county joins; county population coverage uses ACS county populations. NOAA precipitation and snowfall are converted explicitly to millimeters. The 1991–2020 NOAA annual normals source also supplies its exact annual Tmax >=90°F count for the hot-day metric.

The San Francisco Bay Area display label resolves to Census CBSA 41860 (San Francisco-Oakland-Fremont). San Jose is a separate official CBSA and is not silently merged into the single-CBSA feature contract.

## Hot-day and road environment features

`hot_days_32c` is the mean across up to three qualifying NOAA stations of the 1991–2020 `ANN-TMAX-AVGNDS-GRTH090` normal: annual mean days with daily maximum temperature at least 90°F (32.222…°C). Stations are ordered by great-circle distance from the existing CBSA representative point and must be within 100 km; stations without that NOAA normal are skipped. The city value is a station proxy. A missing station result remains missing. See [NOAA U.S. Climate Normals](https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals) and its [annual/seasonal normals product](https://www.ncei.noaa.gov/access/search/datasets/normals-annualseasonal/).

Road environment features use the frozen 2024 CBSA county membership and official 2024 Census TIGER/Line All Lines county edge files (`EDGES`). Only unique topological edges flagged as roads (`ROADFLG=Y`) and assigned these MTFCCs are retained: `S1100` primary roads, `S1200` secondary roads, `S1400` local neighborhood/rural/city roads, `S1630` ramps, `S1640` service drives, and `S1730` alleys. 4WD trails, walkways, stairways, private resource roads, and parking-lot roads are excluded. CBSAs are represented by whole member counties in this dataset, so all member-county edges are selected without within-county polygon clipping. Geometries are projected from NAD83 geographic coordinates into the local UTM zone before distance calculations. CBSA land area remains the existing sum of member-county Census `ALAND`, in km².

- `road_density_km_per_km2` = unique clipped road centerline km / CBSA land km².
- `intersection_density_per_km2` = clipped road-network junctions / CBSA land km². Junctions are endpoints shared by at least three distinct topological edges; endpoints within 20 m are clustered to consolidate divided-road junctions and small positional differences. Clipping-created CBSA-border nodes are excluded. Census edge topology does not identify every grade separation.
- `freeway_share` = `S1100` + ramps (`S1630`) km / included road km.
- `arterial_share` = `S1200` km / included road km.
- `local_road_share` = `S1400` + service drives (`S1640`) + alleys (`S1730`) km / included road km. This is a local/residual Census road-class grouping, not an FHWA functional-system classification.
- `average_aadt` and `lane_miles_per_km2` remain explicitly missing. TIGER/Line has no AADT or lane-count fields. FHWA's public [HPMS geospatial release](https://www.fhwa.dot.gov/policyinformation/hpms/shapefiles_2017.cfm) documents legacy 2011–2017 data and cautions about sampled/limited coverage; those data are not a current, complete, CBSA-comparable road segment layer. No values are inferred from incomplete coverage.

These road measures describe public road-environment characteristics and network proxies. They do not measure autonomous-driving safety, readiness, or deployment approval. Provenance references the raw Census county edge snapshots and records the CBSA, source vintage, MTFCC rules, and projected CRS. Only counties in the 35 configured CBSA geographies are downloaded; the combined raw archives are large and should not be committed. `.gitignore` excludes raw downloads and rebuildable intermediates while retaining the processed city JSON release and manifest. Rebuild commands redownload removed snapshots and verify/cache them using the existing ingestion layer.

## Provenance and outputs

Every available nonmissing measurement references provenance containing its source URL, dataset/vintage, source and target geography, transformation, assumptions, retrieval time, and real SHA-256 of the saved raw artifact. Missing measurements include an explicit reason. Legal evidence remains empty until a suitable authoritative source is implemented.

The primary outputs are:

```text
data/processed/cities/{cbsa_code}.json
data/processed/cities/all_city_features.json
data/processed/cities/all_city_features.xlsx
data/processed/cities/all_city_features.parquet
data/processed/reference_markets/reference_markets.json
data/processed/manifests/data_manifest.json
data/processed/intermediate/cbsa_catalog.parquet
data/processed/intermediate/cbsa_boundaries.parquet
data/processed/intermediate/cbsa_counties.parquet
data/processed/intermediate/charging_sites.parquet
```

Further intermediates are dataset-specific and are emitted when their source is retrieved and processed. The road network summary is `data/processed/intermediate/road_network_features.parquet`; the 270 raw county ZIPs used to calculate it were removed after processing, with hashes preserved in the manifest. A full rebuild downloads missing inputs again. OSM, LODES, FARS, transit, airport, FRA, WOMD, NGSIM, and WZDx adapters are not required for the current `CityFeature` contract; see module docstrings and TODO markers for their status.

## Known limitations and future simulation use

The initial builder uses CBSA-level ACS published estimates; it does not use unweighted tract percentages. NOAA precipitation and snowfall use the nearest station proxy. NOAA hot-day counts use up to three nearest qualifying stations within 100 km and represent the long-term annual >=90°F climate normal. TIGER road classes are Census feature classes, not lane counts; current complete HPMS AADT and through-lane coverage was not obtained, so those two requested features remain explicitly missing. AFDC public charging does not represent private autonomous-fleet depots. The Waymo classification is a dated snapshot of the official public page, not evidence about private fleet availability or an operator's internal market strategy. Reference-market categories and current service states are validated from page sections each rebuild.

The contract includes the existing city measures plus `hot_days_32c` and the seven requested road/traffic measures. Road graphs, home/work OD flow, crash locations, GTFS schedules, airport activity, and rail crossings belong in dataset-specific intermediate tables for future service-zone generation, routing, charging, and fleet simulation.

## Verified build status

The keyless ACS path downloads four official Census Summary File tables and resolves all 35 configured markets to TIGER/Line CBSAs. The verified release includes NOAA >=90°F normals and CBSA road-network summaries for the configured markets. A Census API error falls back to the official ACS Summary Files. AFDC requires its configured API credentials; absent or rejected credentials produce explicit missing charging measurements. The current main CLI does not yet download/process LODES, OSM, FARS, GTFS, BTS T-100, or FRA feeds: those dataset adapters are partial and their intermediates are not present unless invoked separately. WOMD, NGSIM, and WZDx remain scaffolds.
