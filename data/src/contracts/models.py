"""Authoritative Pydantic v2 contracts from the project specification."""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

NonNegative = Annotated[float, Field(ge=0, allow_inf_nan=False)]
Positive = Annotated[float, Field(gt=0, allow_inf_nan=False)]
Score = Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]
Fraction = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
Count = Annotated[int, Field(ge=0)]
Pillar = Literal["familiarity", "readiness", "opportunity"]
DataMode = Literal["mock", "verified"]
FeatureKey = Literal["annual_precipitation_mm", "annual_snowfall_mm", "hot_days_32c", "mean_commute_minutes", "public_dc_ports_per_100k", "population_share_in_counties_with_dc", "population", "population_density_per_km2", "zero_vehicle_household_share", "transit_commute_share", "road_density_km_per_km2", "intersection_density_per_km2", "average_aadt", "lane_miles_per_km2", "freeway_share", "arterial_share", "local_road_share"]

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

    @model_validator(mode="after")
    def valid_raw_hash(self):
        if len(self.raw_sha256) != 64 or any(ch not in "0123456789abcdef" for ch in self.raw_sha256.lower()):
            raise ValueError("raw_sha256 must be a 64-character SHA-256 hex digest")
        if not self.source_url.strip():
            raise ValueError("source_url is required")
        return self

class Measurement(DTO):
    value: float | None
    unit: str
    quality: Literal["observed", "derived", "proxy", "missing"]
    missing_reason: str | None
    provenance_ids: list[str]

    @model_validator(mode="after")
    def quality_matches_value(self):
        if self.quality == "missing":
            if self.value is not None or not (self.missing_reason or "").strip():
                raise ValueError("missing measurements require value=None and a reason")
        elif self.value is None or not self.provenance_ids:
            raise ValueError("observed/derived/proxy measurements require a value and provenance")
        return self

class LegalEvidence(DTO):
    jurisdiction: str
    category: Literal["documented_pathway", "documented_restriction", "unresolved"]
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

    @model_validator(mode="after")
    def provenance_is_complete(self):
        ids = [item.id for item in self.provenance]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate provenance IDs")
        dangling = {pid for m in self.features.values() for pid in m.provenance_ids} - set(ids)
        if dangling:
            raise ValueError(f"measurements reference absent provenance IDs: {sorted(dangling)}")
        expected = {"annual_precipitation_mm", "annual_snowfall_mm", "hot_days_32c", "mean_commute_minutes", "public_dc_ports_per_100k", "population_share_in_counties_with_dc", "population", "population_density_per_km2", "zero_vehicle_household_share", "transit_commute_share", "road_density_km_per_km2", "intersection_density_per_km2", "average_aadt", "lane_miles_per_km2", "freeway_share", "arterial_share", "local_road_share"}
        if set(self.features) != expected:
            raise ValueError("CityFeature must contain exactly the registered measurements")
        for key, measurement in self.features.items():
            if measurement.value is not None and key in {"annual_precipitation_mm", "annual_snowfall_mm", "hot_days_32c", "public_dc_ports_per_100k", "population", "population_density_per_km2", "mean_commute_minutes", "road_density_km_per_km2", "intersection_density_per_km2", "average_aadt", "lane_miles_per_km2"} and measurement.value < 0:
                raise ValueError(f"{key} must be nonnegative")
            if measurement.value is not None and key in {"population_share_in_counties_with_dc", "zero_vehicle_household_share", "transit_commute_share", "freeway_share", "arterial_share", "local_road_share"} and not 0 <= measurement.value <= 1:
                raise ValueError(f"{key} must be a fraction in [0,1]")
        shares = [self.features[key].value for key in ("freeway_share", "arterial_share", "local_road_share")]
        if all(value is not None for value in shares) and abs(sum(shares) - 1.0) > 1e-6:
            raise ValueError("road functional-class shares must sum to 1")
        return self

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
    demand_multiplier: Annotated[float, Field(ge=0, le=5, allow_inf_nan=False)] = 1
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

    @model_validator(mode="after")
    def valid_charging_profile(self):
        if len(self.hourly_demand_weights) != 24 or sum(self.hourly_demand_weights) <= 0:
            raise ValueError("hourly_demand_weights must contain 24 entries and sum to > 0")
        if not self.reserve_fraction <= self.charge_trigger_fraction < self.charge_target_fraction <= 1:
            raise ValueError("invalid reserve/charge fraction ordering")
        return self
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
