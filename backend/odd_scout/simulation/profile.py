"""Server-owned demand profiles for the hypothetical fleet simulator."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from contracts.models import DTO, Positive, SimulationDemandSource
from pydantic import Field, model_validator

ROOT = Path(__file__).resolve().parents[3]
RISM_PATH = ROOT / "data/releases/simulation/providence-rism-2015.v1.json"
RISM_ARTIFACT_SHA256 = (
    "9506de3ebb7d8c757b064c858e196b7d228046b765489c95d6cd459504155cfb"
)


class DemandPoint(DTO):
    x_miles: float
    y_miles: float


class DemandZone(DTO):
    zone_id: str
    longitude: float
    latitude: float
    area_sq_miles: Positive
    trip_production_2015: Positive
    trip_attraction_2015: Positive
    x_miles: float
    y_miles: float
    sample_points: list[DemandPoint]

    @model_validator(mode="after")
    def has_sample_points(self):
        if len(self.sample_points) != 32:
            raise ValueError("Each RISM zone needs 32 audited in-polygon points")
        return self


class RismArtifact(DTO):
    profile_id: str
    city_id: str
    kind: str
    source_name: str
    source_url: str
    source_period: str
    retrieved_at: str
    source_geography: str
    raw_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    zone_count: int
    zone_area_sq_miles: Positive
    coordinate_origin_longitude: float
    coordinate_origin_latitude: float
    miles_per_degree_longitude: Positive
    miles_per_degree_latitude: Positive
    transformation: str
    limitations: list[str]
    zones: list[DemandZone]

    @model_validator(mode="after")
    def consistent(self):
        if (
            self.profile_id != "providence-rism-2015.v1"
            or self.city_id != "cbsa:39300"
            or self.kind != "public_model_proxy"
            or self.zone_count != len(self.zones)
            or len(self.zones) != 86
            or len({zone.zone_id for zone in self.zones}) != len(self.zones)
        ):
            raise ValueError("Providence RISM profile identity or zones are invalid")
        return self


@dataclass(frozen=True)
class DemandProfile:
    source: SimulationDemandSource
    zones: tuple[DemandZone, ...]
    origin_longitude: float
    origin_latitude: float
    miles_per_degree_longitude: float
    miles_per_degree_latitude: float


def load_rism_profile() -> DemandProfile:
    raw = RISM_PATH.read_bytes()
    artifact_sha256 = hashlib.sha256(raw).hexdigest()
    if artifact_sha256 != RISM_ARTIFACT_SHA256:
        raise ValueError("Providence RISM profile differs from its pinned artifact")
    artifact = RismArtifact.model_validate_json(raw)
    source = SimulationDemandSource(
        profile_id=artifact.profile_id,
        kind="public_model_proxy",
        source_name=artifact.source_name,
        source_url=artifact.source_url,
        source_period=artifact.source_period,
        retrieved_at=artifact.retrieved_at,
        source_geography=artifact.source_geography,
        raw_sha256=artifact.raw_sha256,
        artifact_sha256=artifact_sha256,
        transformation=artifact.transformation,
        limitations=artifact.limitations,
    )
    return DemandProfile(
        source=source,
        zones=tuple(artifact.zones),
        origin_longitude=artifact.coordinate_origin_longitude,
        origin_latitude=artifact.coordinate_origin_latitude,
        miles_per_degree_longitude=artifact.miles_per_degree_longitude,
        miles_per_degree_latitude=artifact.miles_per_degree_latitude,
    )
