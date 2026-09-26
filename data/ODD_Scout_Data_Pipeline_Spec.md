# ODD Scout Data Pipeline Specification

## 1. Project Purpose

ODD Scout is an AI-assisted expansion analysis and simulation project for autonomous-vehicle markets.

The data pipeline must support:

1. **Part 1 — City Ranking / ODD Analysis**
2. **Part 2 — 7-Day Fleet Simulation**

The immediate goal is to build a reliable Python ingestion and processing layer that:

- downloads or loads public datasets,
- preserves raw source files,
- hashes raw inputs,
- transforms source geography into CBSA-level city features,
- calculates the required feature values,
- records detailed provenance,
- handles missing values correctly,
- validates outputs through Pydantic schemas,
- exports one `CityFeature` JSON file per metro plus combined outputs,
- preserves tract/road/OD detail for the future simulation engine.

Do **not** implement the full ranking algorithm or fleet simulation unless small helpers are needed to validate processed outputs.

---

## 2. Authoritative Pydantic Contracts

These schemas are the source of truth.

```python
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field

NonNegative = Annotated[float, Field(ge=0, allow_inf_nan=False)]
Positive = Annotated[float, Field(gt=0, allow_inf_nan=False)]
Score = Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]
Fraction = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
Count = Annotated[int, Field(ge=0)]

Pillar = Literal["familiarity", "readiness", "opportunity"]
DataMode = Literal["mock", "verified"]

FeatureKey = Literal[
    "annual_precipitation_mm",
    "annual_snowfall_mm",
    "hot_days_32c",
    "mean_commute_minutes",
    "public_dc_ports_per_100k",
    "population_share_in_counties_with_dc",
    "population",
    "population_density_per_km2",
    "zero_vehicle_household_share",
    "transit_commute_share",
]

class DTO(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

class VersionStamp(DTO):
    schema_version: Literal["1"]
    data_version: str
    model_version: str
    data_mode: DataMode

class Provenance(DTO):
    id: str
    source_name: str
    source_url: str
    dataset_id: str
    period: str
    retrieved_at: str
    source_geography: str
    target_geography: str
    transformation: str
    assumptions: list[str]
    raw_sha256: str

class Measurement(DTO):
    value: float | None
    unit: str
    quality: Literal["observed", "derived", "proxy", "missing"]
    missing_reason: str | None
    provenance_ids: list[str]

class LegalEvidence(DTO):
    jurisdiction: str
    category: Literal[
        "documented_pathway", "documented_restriction", "unresolved"
    ]
    summary: str
    checked_at: str
    provenance_ids: list[str]

class CityFeature(DTO):
    versions: VersionStamp
    city_id: str
    display_name: str
    official_name: str
    geography_type: Literal["cbsa"]
    geography_vintage: str
    state_codes: list[str]
    latitude: Annotated[float, Field(ge=-90, le=90)]
    longitude: Annotated[float, Field(ge=-180, le=180)]
    features: dict[FeatureKey, Measurement]
    legal_evidence: list[LegalEvidence]
    provenance: list[Provenance]

class ReferenceMarket(DTO):
    id: str
    city_id: str
    operator: str
    category: Literal["commercial", "announced", "testing"]
    status_as_of: str
    enabled: bool
    provenance_ids: list[str]

class PillarWeights(DTO):
    familiarity: NonNegative = 0.40
    readiness: NonNegative = 0.20
    opportunity: NonNegative = 0.40

class RankingRequest(DTO):
    weights: PillarWeights = Field(default_factory=PillarWeights)
    reference_ids: list[str] | None = None

class PillarScores(DTO):
    familiarity: Score | None
    readiness: Score | None
    opportunity: Score | None

class FactorResult(DTO):
    feature: FeatureKey
    pillar: Pillar
    raw_value: float | None
    normalized_value: Fraction | None
    reference_value: float | None
    distance_component: NonNegative | None
    score_points: NonNegative | None
    provenance_ids: list[str]

class ReferenceMatch(DTO):
    reference_id: str
    distance: NonNegative
    similarity: Score

class CityScore(DTO):
    city_id: str
    rank: int | None
    expansion_score: Score | None
    pillars: PillarScores
    coverage: Fraction
    exclusion_reasons: list[str]
    factors: list[FactorResult]
    reference_matches: list[ReferenceMatch]
    strongest_factor_ids: list[FeatureKey]
    weakest_factor_ids: list[FeatureKey]
    legal_flags: list[str]

class RankingResult(DTO):
    versions: VersionStamp
    ranking_id: str
    normalized_weights: PillarWeights
    reference_ids: list[str]
    ranked: list[CityScore]
    unranked: list[CityScore]

class Explanation(DTO):
    ranking_id: str
    city_id: str
    mode: Literal["template", "llm"]
    summary: str
    advantages: list[str]
    tradeoffs: list[str]
    evidence_ids: list[str]

class SimulationRequest(DTO):
    city_id: str
    fleet_size: Annotated[int, Field(ge=1, le=200)] = 50
    days: Annotated[int, Field(ge=1, le=7)] = 7
    demand_multiplier: Annotated[
        float, Field(ge=0, le=5, allow_inf_nan=False)
    ] = 1
    base_fare_usd: Annotated[float, Field(ge=0, le=50)] = 3
    price_per_mile_usd: Annotated[float, Field(ge=0, le=20)] = 1.75
    price_per_minute_usd: Annotated[float, Field(ge=0, le=5)] = 0.30
    seed: Annotated[int, Field(ge=0, le=4294967295)] = 42

class SimulationAssumptions(DTO):
    profile_id: str
    base_requests_per_day: Positive
    service_zone_radius_miles: Positive
    average_speed_mph: Positive
    road_distance_multiplier: Positive
    hourly_demand_weights: list[NonNegative]
    battery_range_miles: Positive
    reserve_fraction: Fraction
    charge_trigger_fraction: Fraction
    charge_target_fraction: Fraction
    charge_range_miles_per_minute: Positive
    charger_count: Annotated[int, Field(ge=1)]
    max_pickup_wait_minutes: Positive
    pickup_dwell_minutes: NonNegative
    dropoff_dwell_minutes: NonNegative

class SimulationMetrics(DTO):
    total_requests: Count
    rides_completed: Count
    rejected_requests: Count
    unfinished_requests: Count
    average_wait_minutes: NonNegative | None
    p95_wait_minutes: NonNegative | None
    utilization_pct: Score
    passenger_utilization_pct: Score
    paid_miles: NonNegative
    empty_miles: NonNegative
    empty_mile_pct: Score | None
    charging_vehicle_hours: NonNegative
    charging_queue_vehicle_hours: NonNegative
    gross_revenue_usd: NonNegative
    revenue_per_vehicle_usd: NonNegative
    rides_per_vehicle: NonNegative

class HourlyMetrics(DTO):
    hour: Count
    requests: Count
    completed_rides: Count
    rejected_requests: Count
    average_wait_minutes: NonNegative | None
    utilization_pct: Score
    gross_revenue_usd: NonNegative

class SimulationResult(DTO):
    versions: VersionStamp
    simulation_id: str
    request: SimulationRequest
    assumptions: SimulationAssumptions
    metrics: SimulationMetrics
    hourly: list[HourlyMetrics]
    warnings: list[str]
```

TypeScript interfaces must be generated from OpenAPI. The Pydantic models remain the only source of truth.

---

## 3. Candidate Expansion Markets

Resolve each display city to the official Census Core-Based Statistical Area.

Use:

```text
geography_type = "cbsa"
```

Target candidate markets:

- Jacksonville, Florida
- Columbus, Ohio
- Indianapolis, Indiana
- Milwaukee, Wisconsin
- Memphis, Tennessee
- Louisville, Kentucky
- Oklahoma City, Oklahoma
- El Paso, Texas
- Albuquerque, New Mexico
- Kansas City, Missouri
- Cincinnati, Ohio
- Cleveland, Ohio
- Raleigh, North Carolina
- Virginia Beach, Virginia
- Richmond, Virginia
- Salt Lake City, Utah
- Birmingham, Alabama
- Tulsa, Oklahoma
- Providence, Rhode Island
- Hartford, Connecticut

Use the official Census CBSA code as `city_id`.

Do not use municipal boundaries for ranking.

---

## 4. Waymo Reference Markets

Reference markets:

- Phoenix, Arizona
- San Francisco Bay Area, California
- Los Angeles, California
- Austin, Texas
- Atlanta, Georgia
- Dallas, Texas
- Denver, Colorado
- Houston, Texas
- Miami, Florida
- Nashville, Tennessee
- Orlando, Florida
- San Antonio, Texas
- San Diego, California
- Tampa, Florida
- Las Vegas, Nevada

Resolve each to its correct CBSA.

Create `ReferenceMarket` records with:

```text
operator = "Waymo"
```

Do not infer `category` from memory. Verify current status from authoritative Waymo sources if online access is available. If verification is unavailable, leave the issue explicit rather than fabricating a status.

---

## 5. Required Feature Outputs

The current `FeatureKey` contract supports exactly:

- `annual_precipitation_mm`
- `annual_snowfall_mm`
- `hot_days_32c`
- `mean_commute_minutes`
- `public_dc_ports_per_100k`
- `population_share_in_counties_with_dc`
- `population`
- `population_density_per_km2`
- `zero_vehicle_household_share`
- `transit_commute_share`

Do not insert unsupported feature keys into `CityFeature.features`.

Additional processed datasets must be stored as intermediate outputs for later schema expansion and simulation.

---

## 6. Dataset-to-Feature Mapping

### Census ACS

Produce:

- `population`
- `mean_commute_minutes`
- `zero_vehicle_household_share`
- `transit_commute_share`

Use a recent ACS 5-Year vintage.

Rules:

- aggregate numerators and denominators before calculating percentages;
- do not average tract or county percentages directly;
- calculate `transit_commute_share` from transit commuters divided by the proper commute-mode universe;
- calculate `zero_vehicle_household_share` from zero-vehicle households divided by the correct household universe;
- derive mean commute time using the correct aggregate commute-time numerator and worker denominator where possible.

### Census TIGER/Line / CBSA Geography

Use for:

- CBSA boundaries
- county membership
- state membership
- land area
- representative latitude/longitude

Produce:

- `population_density_per_km2`

Formula:

```text
population / CBSA land area in km²
```

Do not use bounding-box area. Do not include water area.

### NOAA Climate Normals / NCEI

Produce:

- `annual_precipitation_mm`
- `annual_snowfall_mm`
- `hot_days_32c`

Use a consistent normal period where possible.

Convert units explicitly.

If `hot_days_32c` cannot be faithfully derived from the chosen product, return a missing measurement rather than fabricate.

### AFDC Alternative Fuel Stations

Produce:

- `public_dc_ports_per_100k`
- `population_share_in_counties_with_dc`

Filter for qualifying public DC fast-charging infrastructure.

Use **ports**, not stations, when the source supports port-level counts.

Formula:

```text
public_dc_ports_per_100k =
public DC fast-charging ports in CBSA / CBSA population * 100000
```

For county coverage:

```text
population_share_in_counties_with_dc =
population in CBSA counties containing >=1 qualifying public DC port
/
total CBSA population
```

Handle multi-state CBSAs correctly.

---

## 7. Additional Datasets for Future Ranking and Simulation

Create reusable ingestion/processing modules where practical for:

- OpenStreetMap / Geofabrik
- Census TIGER/Line
- ACS
- LODES
- NHTSA FARS
- NOAA
- National Transit Map / GTFS
- Waymo Open Motion Dataset
- Waymo service locations
- AFDC
- BTS T-100 airport statistics
- FRA grade crossings
- FHWA NGSIM
- WZDx

Implementation priority:

### Fully implement

- Census geography / CBSA
- ACS
- NOAA
- AFDC
- Waymo reference-market metadata

### Strongly implement reusable intermediates

- OSM
- LODES
- FARS
- BTS airport
- FRA crossings
- Transit / GTFS

### Scaffold if too heavy for current scope

- Waymo Open Motion Dataset
- NGSIM
- WZDx

Scaffolds must include:

- configuration,
- loader interface,
- expected raw path,
- expected processed schema,
- documentation,
- TODO notes.

Never generate fake dataset values.

---

## 8. Recommended Project Structure

```text
src/
├── contracts/
│   ├── __init__.py
│   └── models.py
├── config/
│   ├── cities.py
│   ├── datasets.py
│   └── settings.py
├── common/
│   ├── hashing.py
│   ├── http.py
│   ├── geography.py
│   ├── provenance.py
│   ├── validation.py
│   └── units.py
├── datasets/
│   ├── census_geography/
│   │   ├── download.py
│   │   ├── load.py
│   │   ├── process.py
│   │   └── schemas.py
│   ├── acs/
│   │   ├── download.py
│   │   ├── load.py
│   │   ├── process.py
│   │   └── variables.py
│   ├── noaa/
│   │   ├── download.py
│   │   ├── load.py
│   │   └── process.py
│   ├── afdc/
│   │   ├── download.py
│   │   ├── load.py
│   │   └── process.py
│   ├── osm/
│   │   ├── download.py
│   │   ├── load.py
│   │   └── process.py
│   ├── lodes/
│   │   ├── download.py
│   │   ├── load.py
│   │   └── process.py
│   ├── fars/
│   │   ├── download.py
│   │   ├── load.py
│   │   └── process.py
│   ├── transit/
│   │   ├── download.py
│   │   ├── load.py
│   │   └── process.py
│   ├── airports/
│   │   ├── download.py
│   │   ├── load.py
│   │   └── process.py
│   ├── fra/
│   │   ├── download.py
│   │   ├── load.py
│   │   └── process.py
│   └── waymo/
│       ├── reference_markets.py
│       └── motion_dataset.py
├── pipeline/
│   ├── build_city_features.py
│   ├── build_reference_markets.py
│   └── run_all.py
└── tests/
    ├── test_contracts.py
    ├── test_acs.py
    ├── test_noaa.py
    ├── test_afdc.py
    ├── test_geography.py
    └── test_city_features.py
```

---

## 9. Raw and Processed Data Layout

```text
data/
├── raw/
│   ├── census/
│   ├── acs/
│   ├── noaa/
│   ├── afdc/
│   ├── osm/
│   ├── lodes/
│   ├── fars/
│   ├── transit/
│   ├── airports/
│   ├── fra/
│   └── waymo/
├── processed/
│   ├── cities/
│   ├── reference_markets/
│   ├── intermediate/
│   └── manifests/
└── cache/
```

Never overwrite raw files unless explicitly requested.

Use deterministic filenames including dataset and vintage where practical.

---

## 10. Provenance Requirements

Every non-missing `Measurement` must reference one or more `Provenance` records.

Each provenance record must include:

- source name
- source URL
- dataset identifier
- data period
- retrieval timestamp
- source geography
- target geography
- transformation
- assumptions
- SHA-256 hash of raw input

Hashes must be real.

If source data comes from an API, save the raw response before processing and hash that saved raw artifact.

---

## 11. Missing Data Rules

Never convert missing data into zero.

For missing values:

```python
Measurement(
    value=None,
    unit="...",
    quality="missing",
    missing_reason="...",
    provenance_ids=[...],
)
```

Use:

- `observed` for directly reported values,
- `derived` for arithmetic transformations,
- `proxy` only for documented approximations,
- `missing` for unavailable values.

---

## 12. Cross-Field Validation Rules

### Measurement

If:

```text
quality == "missing"
```

then:

```text
value is None
missing_reason is non-empty
```

If:

```text
quality != "missing"
```

then:

```text
value is not None
provenance_ids is not empty
missing_reason should normally be None
```

### CityFeature

- all referenced provenance IDs must exist in `CityFeature.provenance`;
- no duplicate provenance IDs;
- all feature keys must be valid `FeatureKey` values;
- coordinates must be valid;
- CBSA ID must resolve to the official CBSA.

### SimulationAssumptions

When used later, enforce:

```text
len(hourly_demand_weights) == 24
sum(hourly_demand_weights) > 0
reserve_fraction <= charge_trigger_fraction < charge_target_fraction <= 1
```

---

## 13. Geography Rules

Create:

```text
data/processed/intermediate/cbsa_catalog.parquet
```

with:

- `cbsa_code`
- `official_name`
- `display_name`
- `states`
- `geometry`
- `land_area_km2`
- `latitude`
- `longitude`
- `candidate_market`
- `reference_market`

Handle multi-state CBSAs correctly.

Pay particular attention to:

- Kansas City
- Cincinnati
- Louisville
- Providence

Do not restrict calculations to only the principal city's named state.

---

## 14. Representative Coordinates

Preferred order:

1. population-weighted centroid if practical;
2. point-on-surface / representative geometry point;
3. official Census representative coordinates if available.

Document the selected methodology.

Do not use arbitrary downtown coordinates while labeling them CBSA coordinates.

---

## 15. Excel Workbook Instructions

The repository includes an Excel workbook containing dataset information.

Read at least:

- `Dataset Catalog`
- `MVP Architecture`
- `Coverage Summary`

Use it to identify:

- official source URLs,
- dataset purposes,
- priorities,
- implementation notes.

Treat authoritative public-source documentation as higher priority if the workbook is stale.

Do not modify the workbook unless explicitly requested.

---

## 16. Configuration

Centralize:

- data vintage
- geography vintage
- model version
- data mode
- API keys
- download directories
- timeouts
- retry counts
- candidate markets
- reference markets

Use environment variables such as:

```text
CENSUS_API_KEY
NREL_API_KEY
```

Provide `.env.example`.

Never hardcode secrets.

---

## 17. Data Mode

Use:

```text
data_mode = "verified"
```

only when outputs come from actually retrieved authoritative data.

Use:

```text
data_mode = "mock"
```

only for explicit fixtures/tests/demo mode.

Production code must never silently fall back from verified to mock.

---

## 18. Data Versioning

Use deterministic version metadata.

Example:

```python
VersionStamp(
    schema_version="1",
    data_version="2024-acs5__1991-2020-noaa__afdc-2026-09-26",
    model_version="city-feature-v1",
    data_mode="verified",
)
```

Exact string format may vary but must clearly communicate data vintages.

---

## 19. Required Outputs

For every candidate and reference metro:

```text
data/processed/cities/{cbsa_code}.json
```

Validated against `CityFeature`.

Also produce:

```text
data/processed/cities/all_city_features.json
data/processed/cities/all_city_features.parquet
data/processed/reference_markets/reference_markets.json
data/processed/manifests/data_manifest.json
```

The manifest must record:

- dataset
- source
- vintage
- retrieval time
- raw path
- SHA-256
- processed outputs
- row counts
- warnings

---

## 20. Intermediate Outputs for the Future Simulator

Prepare:

```text
data/processed/intermediate/cbsa_boundaries.parquet
data/processed/intermediate/tract_features.parquet
data/processed/intermediate/lodes_od.parquet
data/processed/intermediate/osm_road_features.parquet
data/processed/intermediate/fars_by_geography.parquet
data/processed/intermediate/transit_features.parquet
data/processed/intermediate/airport_features.parquet
data/processed/intermediate/fra_crossing_features.parquet
data/processed/intermediate/charging_sites.parquet
```

These will later support:

- service-area generation,
- synthetic ride-demand generation,
- routing,
- fleet simulation,
- charging logic,
- weather stress testing.

Do not aggregate away tract, road-network, or OD-flow data needed for Part 2.

---

## 21. Testing Requirements

Test at least:

### Geography

- all 20 candidate cities resolve to one CBSA;
- all 15 Waymo reference markets resolve to one CBSA;
- multi-state CBSAs include all appropriate states;
- no market accidentally resolves to only a municipal boundary.

### Feature values

- population > 0;
- density > 0;
- commute time > 0 when available;
- shares remain between 0 and 1;
- precipitation/snowfall/hot days are nonnegative;
- DC ports per 100k is nonnegative.

### Provenance

- every provenance reference exists;
- raw hashes are valid 64-character SHA-256 hex strings;
- source URLs are populated;
- no verified measurement lacks provenance.

### Serialization

Every `CityFeature` must pass:

```python
model_validate(...)
model_dump(mode="json")
```

and round-trip validation.

---

## 22. Engineering Requirements

- Python 3.12+
- type hints throughout
- modular functions
- docstrings for public functions
- `pathlib`
- structured logging
- retries/backoff for HTTP
- explicit HTTP timeouts
- local caching
- deterministic processing
- clear exceptions
- pandas/geopandas for tabular/geospatial work
- Parquet for intermediate outputs
- JSON for contract outputs
- avoid unnecessary dependencies
- no giant notebook as primary implementation

---

## 23. No Fabricated Data

Never fabricate:

- values,
- NOAA outputs,
- ACS outputs,
- CBSA IDs,
- charging counts,
- Waymo market status,
- hashes,
- legal evidence,
- successful downloads.

If data cannot be retrieved, fail clearly or mark the measurement as missing.

---

## 24. Legal Evidence

Do not perform broad legal/regulatory analysis unless a suitable authoritative source is explicitly available.

For now, if verified legal evidence is unavailable:

```python
legal_evidence=[]
```

Do not manufacture regulatory claims.

---

## 25. README Requirement

Create:

```text
README_DATA_PIPELINE.md
```

It must explain:

1. project purpose;
2. required API keys;
3. installation;
4. dataset downloads;
5. running one dataset pipeline;
6. running all pipelines;
7. CBSA resolution;
8. feature definitions;
9. provenance handling;
10. output files;
11. known limitations;
12. future simulation usage.

Include exact runnable commands.

---

## 26. CLI

Support commands similar to:

```bash
python -m src.pipeline.run_all --download --process
```

```bash
python -m src.pipeline.run_all --cities jacksonville columbus indianapolis
```

```bash
python -m src.datasets.acs.download --year 2024
```

```bash
python -m src.pipeline.build_city_features --validate
```

Avoid unnecessary orchestration frameworks.

---

## 27. Execution Order

### Phase 1 — Foundation

1. Pydantic contracts
2. configuration
3. candidate/reference definitions
4. CBSA resolver
5. provenance utilities
6. hashing utilities
7. HTTP/cache helpers

### Phase 2 — Required Datasets

8. ACS
9. Census geography
10. NOAA
11. AFDC
12. Waymo reference-market metadata

### Phase 3 — CityFeature Generation

13. aggregate to CBSA
14. construct measurements
15. construct provenance
16. validate CityFeature
17. export JSON + Parquet
18. run tests

### Phase 4 — Future Simulator Inputs

19. LODES
20. OSM
21. FARS
22. transit
23. airports
24. FRA crossings

### Phase 5 — Optional Scaffolds

25. WOMD
26. NGSIM
27. WZDx

Do not spend excessive time on optional datasets before required `CityFeature` outputs validate.

---

## 28. Architecture

```text
PUBLIC DATASETS
      ↓
DATASET-SPECIFIC LOADERS
      ↓
CLEANED SOURCE TABLES
      ↓
CBSA GEOGRAPHIC NORMALIZATION
      ↓
FEATURE ENGINEERING
      ↓
CITYFEATURE CONTRACT
      ↓
CITY RANKING
      ↓
TOP 3 CITIES
      ↓
TRACT / ROAD / OD DATA
      ↓
7-DAY FLEET SIMULATION
```

The ingestion layer must support both city ranking and later simulation.

---

## 29. Success Condition

The pipeline succeeds when one command can generate validated `CityFeature` records for all candidate and reference CBSAs with:

- real public data,
- traceable transformations,
- real hashes,
- correct geography,
- explicit missing-data handling,
- no invented values.

Example shape:

```python
CityFeature(
    versions=...,
    city_id="...",
    display_name="Milwaukee, Wisconsin",
    official_name="Milwaukee-Waukesha, WI",
    geography_type="cbsa",
    geography_vintage="...",
    state_codes=["WI"],
    latitude=...,
    longitude=...,
    features={
        "annual_precipitation_mm": Measurement(...),
        "annual_snowfall_mm": Measurement(...),
        "hot_days_32c": Measurement(...),
        "mean_commute_minutes": Measurement(...),
        "public_dc_ports_per_100k": Measurement(...),
        "population_share_in_counties_with_dc": Measurement(...),
        "population": Measurement(...),
        "population_density_per_km2": Measurement(...),
        "zero_vehicle_household_share": Measurement(...),
        "transit_commute_share": Measurement(...),
    },
    legal_evidence=[],
    provenance=[...],
)
```

---

## 30. Final Completion Report

When implementation is complete, report:

```text
FILES CREATED
FILES MODIFIED

DATASETS FULLY IMPLEMENTED
DATASETS PARTIALLY IMPLEMENTED
DATASETS SCAFFOLDED

CITIES SUCCESSFULLY RESOLVED
CITIES WITH DATA ISSUES

FEATURE COVERAGE
- feature
- cities available
- cities missing

TEST RESULTS

DATA QUALITY WARNINGS

COMMAND TO REBUILD EVERYTHING
```
