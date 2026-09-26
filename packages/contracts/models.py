from __future__ import annotations

import math
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

NonNegative = Annotated[float, Field(ge=0, allow_inf_nan=False)]
Positive = Annotated[float, Field(gt=0, allow_inf_nan=False)]
Score = Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]
Fraction = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
Count = Annotated[int, Field(ge=0, strict=True)]
Pillar = Literal["familiarity", "readiness", "opportunity"]
DataMode = Literal["mock", "verified"]
ScoredFeatureKey = Literal[
    "annual_precipitation_mm",
    "annual_snowfall_mm",
    "hot_days_32c",
    "mean_commute_minutes",
    "road_density_km_per_km2",
    "intersection_density_per_km2",
    "freeway_share",
    "arterial_share",
    "local_road_share",
    "public_dc_ports_per_100k",
    "population_share_in_counties_with_dc",
    "population",
    "population_density_per_km2",
    "zero_vehicle_household_share",
    "transit_commute_share",
]
FeatureKey = ScoredFeatureKey | Literal["average_aadt", "lane_miles_per_km2"]
RANKING_V2_KEYS = frozenset(
    {
        "annual_precipitation_mm",
        "annual_snowfall_mm",
        "hot_days_32c",
        "mean_commute_minutes",
        "road_density_km_per_km2",
        "intersection_density_per_km2",
        "freeway_share",
        "arterial_share",
        "local_road_share",
        "public_dc_ports_per_100k",
        "population_share_in_counties_with_dc",
        "population",
        "population_density_per_km2",
        "zero_vehicle_household_share",
        "transit_commute_share",
    }
)
OPTIONAL_INFORMATIONAL_FEATURE_KEYS = frozenset(
    {"average_aadt", "lane_miles_per_km2"}
)

EXPANDED_SCORING_KEYS = frozenset(
    {
        "road_density_km_per_km2",
        "intersection_density_per_km2",
        "freeway_share",
        "arterial_share",
        "local_road_share",
    }
)
NONNEGATIVE_ROAD_KEYS = frozenset(
    {
        "road_density_km_per_km2",
        "intersection_density_per_km2",
        "average_aadt",
        "lane_miles_per_km2",
    }
)
ROAD_SHARE_KEYS = ("freeway_share", "arterial_share", "local_road_share")
UNSCORED_UNITS = {
    "average_aadt": "vehicles/day",
    "lane_miles_per_km2": "lane-miles/km2",
}


class DTO(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class VersionStamp(DTO):
    schema_version: Literal["1"] = "1"
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
    raw_sha256: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]


class Measurement(DTO):
    value: float | None
    unit: str
    quality: Literal["observed", "derived", "proxy", "missing"]
    missing_reason: str | None
    provenance_ids: list[str]

    @model_validator(mode="after")
    def consistent(self):
        if self.value is None:
            if self.quality != "missing" or not self.missing_reason:
                raise ValueError(
                    "Missing measurements require quality=missing and a reason"
                )
        elif (
            self.quality == "missing" or self.missing_reason or not self.provenance_ids
        ):
            raise ValueError(
                "Available measurements require provenance and no missing reason"
            )
        return self


class LegalEvidence(DTO):
    jurisdiction: str
    category: Literal["documented_pathway", "documented_restriction", "unresolved"]
    summary: str
    checked_at: str
    provenance_ids: list[str]


class CityFeature(DTO):
    versions: VersionStamp
    city_id: Annotated[str, Field(pattern=r"^cbsa:\d{5}$")]
    display_name: str
    official_name: str
    geography_type: Literal["cbsa"] = "cbsa"
    geography_vintage: str
    state_codes: list[str]
    latitude: Annotated[float, Field(ge=-90, le=90)]
    longitude: Annotated[float, Field(ge=-180, le=180)]
    features: dict[FeatureKey, Measurement]
    legal_evidence: list[LegalEvidence]
    provenance: list[Provenance]

    @model_validator(mode="after")
    def evidence_resolves(self):
        ids = {p.id for p in self.provenance}
        if len(ids) != len(self.provenance):
            raise ValueError("Duplicate provenance IDs")
        for item in [*self.features.values(), *self.legal_evidence]:
            if not set(item.provenance_ids) <= ids:
                raise ValueError("Unresolved provenance")
        for item in self.legal_evidence:
            if item.category != "unresolved" and not item.provenance_ids:
                raise ValueError("Documented legal claims require evidence")
        for key in NONNEGATIVE_ROAD_KEYS:
            item = self.features.get(key)
            if item is not None and item.value is not None and item.value < 0:
                raise ValueError(f"{key} must be nonnegative")
        for key in ROAD_SHARE_KEYS:
            item = self.features.get(key)
            if item is not None and item.value is not None and not 0 <= item.value <= 1:
                raise ValueError(f"{key} must be a fraction in [0, 1]")
        shares = [self.features.get(key) for key in ROAD_SHARE_KEYS]
        if all(item is not None and item.value is not None for item in shares):
            if not math.isclose(
                sum(item.value for item in shares), 1.0, rel_tol=0, abs_tol=1e-6
            ):
                raise ValueError("Road functional-class shares must sum to one")
        for key, unit in UNSCORED_UNITS.items():
            item = self.features.get(key)
            if item is not None and item.unit != unit:
                raise ValueError(f"Invalid unit: {key}")
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

    @model_validator(mode="after")
    def positive_sum(self):
        total = sum(self.model_dump().values())
        if not math.isfinite(total) or total <= 0:
            raise ValueError("Weight sum must be finite and positive")
        return self


class RankingRequest(DTO):
    weights: PillarWeights = Field(default_factory=PillarWeights)
    reference_ids: list[str] | None = None


class PillarScores(DTO):
    familiarity: Score | None
    readiness: Score | None
    opportunity: Score | None


class FactorResult(DTO):
    feature: ScoredFeatureKey
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
    strongest_factor_ids: list[ScoredFeatureKey]
    weakest_factor_ids: list[ScoredFeatureKey]
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
    fleet_size: Annotated[int, Field(ge=1, le=200, strict=True)] = 50
    days: Annotated[int, Field(ge=1, le=7, strict=True)] = 7
    demand_multiplier: Annotated[float, Field(ge=0, le=5)] = 1
    base_fare_usd: Annotated[float, Field(ge=0, le=50)] = 3
    price_per_mile_usd: Annotated[float, Field(ge=0, le=20)] = 1.75
    price_per_minute_usd: Annotated[float, Field(ge=0, le=5)] = 0.30
    seed: Annotated[int, Field(ge=0, le=4294967295, strict=True)] = 42

    @field_validator("base_fare_usd", "price_per_mile_usd", "price_per_minute_usd")
    @classmethod
    def cents(cls, value):
        if Decimal(str(value)) * 100 != (Decimal(str(value)) * 100).to_integral_value():
            raise ValueError("Fare inputs accept at most two decimal places")
        return value


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
    charger_count: Annotated[int, Field(ge=1, strict=True)]
    max_pickup_wait_minutes: Positive
    pickup_dwell_minutes: NonNegative
    dropoff_dwell_minutes: NonNegative

    @model_validator(mode="after")
    def consistent(self):
        if (
            len(self.hourly_demand_weights) != 24
            or not 0 < sum(self.hourly_demand_weights) < math.inf
        ):
            raise ValueError("Demand curve needs 24 weights with finite positive sum")
        if (
            not self.reserve_fraction
            < self.charge_trigger_fraction
            < self.charge_target_fraction
            <= 1
        ):
            raise ValueError(
                "Battery fractions require reserve < trigger < target <= 1"
            )
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

    @model_validator(mode="after")
    def conserves_requests(self):
        if (
            self.total_requests
            != self.rides_completed + self.rejected_requests + self.unfinished_requests
        ):
            raise ValueError("Requests must reconcile")
        return self


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


class FeatureSpec(DTO):
    key: ScoredFeatureKey
    label: str
    pillar: Pillar
    unit: str
    transform: Literal["linear", "log1p"]
    weight: Positive
    maximum: Positive | None = None
    definition: str


class Bounds(DTO):
    lower: float
    upper: float


class DataRelease(DTO):
    versions: VersionStamp
    candidate_ids: list[str]
    cities: list[CityFeature]
    references: list[ReferenceMarket]
    features: list[FeatureSpec]
    bounds: dict[ScoredFeatureKey, Bounds]
    normalization_cohort: list[str]
    exclusions: list[str]

    @model_validator(mode="after")
    def consistent(self):
        cities = {c.city_id: c for c in self.cities}
        if len(cities) != len(self.cities) or len(set(self.candidate_ids)) != len(
            self.candidate_ids
        ):
            raise ValueError("Duplicate cities")
        if not set(self.candidate_ids + self.normalization_cohort) <= cities.keys():
            raise ValueError("Unknown release city")
        keys = {f.key for f in self.features}
        if len(keys) != len(self.features) or keys != self.bounds.keys():
            raise ValueError("Registry and bounds must match")
        if self.versions.model_version == "ranking.v1" and keys & EXPANDED_SCORING_KEYS:
            raise ValueError("Expanded scoring features require a new model version")
        if self.versions.model_version == "ranking.v2":
            if len(keys) != 15:
                raise ValueError("ranking.v2 requires exactly 15 active scoring features")
            if len(set(self.normalization_cohort)) != len(self.normalization_cohort):
                raise ValueError("Normalization cohort IDs must be unique")
            if self.normalization_cohort != sorted(self.normalization_cohort):
                raise ValueError("ranking.v2 normalization cohort must be sorted")
        if self.versions.model_version == "ranking.v2" and keys != RANKING_V2_KEYS:
            raise ValueError("ranking.v2 requires exactly 15 active scoring features")
        if len({r.id for r in self.references}) != len(self.references):
            raise ValueError("Duplicate reference ID")
        for b in self.bounds.values():
            if b.lower > b.upper:
                raise ValueError("Invalid normalization bounds")
        for city in self.cities:
            if city.versions != self.versions:
                raise ValueError("Cannot mix release versions or data modes")
            for spec in self.features:
                item = city.features.get(spec.key)
                if item is not None:
                    if item.unit != spec.unit:
                        raise ValueError(f"Invalid unit: {spec.key}")
                    if item.value is not None and (
                        item.value < 0
                        or (spec.maximum is not None and item.value > spec.maximum)
                    ):
                        raise ValueError(f"Invalid domain: {spec.key}")
            if self.versions.data_mode == "verified":
                if any(
                    "synthetic" in (p.source_name + p.dataset_id).lower()
                    for p in city.provenance
                ):
                    raise ValueError("Synthetic evidence cannot be verified")
                if any(
                    not p.source_url.startswith("https://") for p in city.provenance
                ):
                    raise ValueError("Verified evidence requires public HTTPS sources")
        for ref in self.references:
            if (
                ref.city_id not in cities
                or not ref.provenance_ids
                or not set(ref.provenance_ids)
                <= {p.id for p in cities[ref.city_id].provenance}
            ):
                raise ValueError("Reference evidence must resolve")
        if self.versions.model_version == "ranking.v2":
            def complete(city_id: str) -> bool:
                city = cities[city_id]
                return all(
                    (measurement := city.features.get(spec.key)) is not None
                    and measurement.value is not None
                    for spec in self.features
                )

            incomplete_enabled = [
                ref.id
                for ref in self.references
                if ref.enabled and not complete(ref.city_id)
            ]
            if incomplete_enabled:
                raise ValueError(
                    "Enabled ranking.v2 references must be complete: "
                    + ", ".join(sorted(incomplete_enabled))
                )
            expected_cohort = sorted(
                {
                    city_id
                    for city_id in self.candidate_ids
                    if complete(city_id)
                }
                | {
                    ref.city_id for ref in self.references if ref.enabled
                }
            )
            if self.normalization_cohort != expected_cohort:
                raise ValueError(
                    "ranking.v2 normalization cohort must contain complete "
                    "candidates and enabled references"
                )
        return self


class CitySummary(DTO):
    city_id: str
    display_name: str
    official_name: str
    latitude: float
    longitude: float


class CityList(DTO):
    versions: VersionStamp
    cities: list[CitySummary]


class PublicConfig(DTO):
    versions: VersionStamp
    weights: PillarWeights
    features: list[FeatureSpec]
    bounds: dict[ScoredFeatureKey, Bounds]
    references: list[ReferenceMarket]
    simulation_defaults: SimulationAssumptions
    exclusions: list[str]


class Health(DTO):
    status: Literal["ok"]
    versions: VersionStamp


class ErrorDetail(DTO):
    code: str
    message: str
    details: list[str] = Field(default_factory=list)


class ErrorResponse(DTO):
    error: ErrorDetail
