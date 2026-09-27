"""Build a pinned Providence spatial proxy from the public RISM TAZ layer."""

from __future__ import annotations

import hashlib
import json
import math
import random
from pathlib import Path
from urllib.request import urlopen

from shapely.geometry import Point, shape

DATA_ROOT = Path(__file__).resolve().parents[3]
RAW_PATH = DATA_ROOT / "data/raw/rism/providence_taz_2015.geojson"
OUTPUT_PATH = DATA_ROOT / "releases/simulation/providence-rism-2015.v1.json"
SOURCE_URL = (
    "https://risegis.ri.gov/hosting/rest/services/RIDOA/"
    "ESTIP_Geoprocessing/MapServer/7/query?"
    "where=Municipali%3D%27Providence%27&"
    "outFields=TAZ%2CMunicipali%2CSqMi%2CProd2015%2CAttrac2015%2CJobs3013&"
    "returnGeometry=true&outSR=4326&f=geojson"
)
RAW_SHA256 = "4ba6796ac38f08c178dfcf81c555109989db235d33fcc5783b62c248dbe96ba6"


def read_snapshot() -> bytes:
    if not RAW_PATH.exists():
        with urlopen(SOURCE_URL, timeout=60) as response:
            raw = response.read()
        if hashlib.sha256(raw).hexdigest() != RAW_SHA256:
            raise ValueError("Official RISM response changed; audit a new raw snapshot")
        RAW_PATH.parent.mkdir(parents=True, exist_ok=True)
        RAW_PATH.write_bytes(raw)
    raw = RAW_PATH.read_bytes()
    if hashlib.sha256(raw).hexdigest() != RAW_SHA256:
        raise ValueError("RISM raw snapshot does not match the pinned SHA-256")
    return raw


def build(raw: bytes) -> dict:
    source = json.loads(raw)
    if source.get("type") != "FeatureCollection":
        raise ValueError("RISM response must be a GeoJSON FeatureCollection")
    features = source.get("features")
    if not isinstance(features, list) or len(features) != 86:
        raise ValueError("Expected the audited 86 Providence TAZ features")

    zones = []
    geometries = {}
    seen = set()
    for feature in features:
        props = feature["properties"]
        zone_id = str(props["TAZ"])
        if zone_id in seen or props["Municipali"] != "Providence":
            raise ValueError("Duplicate or non-Providence RISM zone")
        seen.add(zone_id)
        values = (props["SqMi"], props["Prod2015"], props["Attrac2015"])
        if any(
            not isinstance(v, (int, float)) or not math.isfinite(v) or v <= 0
            for v in values
        ):
            raise ValueError(f"RISM zone {zone_id} has missing or invalid measures")
        geometry = shape(feature["geometry"])
        if geometry.is_empty or not geometry.is_valid:
            raise ValueError(f"RISM zone {zone_id} has invalid geometry")
        geometries[zone_id] = geometry
        point = geometry.representative_point()
        zones.append(
            {
                "zone_id": zone_id,
                "longitude": round(point.x, 8),
                "latitude": round(point.y, 8),
                "area_sq_miles": round(float(props["SqMi"]), 8),
                "trip_production_2015": round(float(props["Prod2015"]), 6),
                "trip_attraction_2015": round(float(props["Attrac2015"]), 6),
            }
        )
    zones.sort(key=lambda zone: int(zone["zone_id"]))
    weight_sum = sum(zone["trip_production_2015"] for zone in zones)
    origin_longitude = (
        sum(zone["longitude"] * zone["trip_production_2015"] for zone in zones)
        / weight_sum
    )
    origin_latitude = (
        sum(zone["latitude"] * zone["trip_production_2015"] for zone in zones)
        / weight_sum
    )
    origin_longitude = round(origin_longitude, 8)
    origin_latitude = round(origin_latitude, 8)
    miles_per_degree_longitude = 69.172 * math.cos(math.radians(origin_latitude))
    for zone in zones:
        zone["x_miles"] = round(
            (zone["longitude"] - origin_longitude) * miles_per_degree_longitude, 6
        )
        zone["y_miles"] = round((zone["latitude"] - origin_latitude) * 69.0, 6)
        geometry = geometries[zone["zone_id"]]
        minimum_x, minimum_y, maximum_x, maximum_y = geometry.bounds
        seed = int(
            hashlib.sha256(f"{RAW_SHA256}:{zone['zone_id']}".encode()).hexdigest()[:16],
            16,
        )
        rng = random.Random(seed)
        points = []
        attempts = 0
        while len(points) < 32:
            attempts += 1
            if attempts > 100_000:
                raise ValueError(
                    f"Could not sample locations inside RISM zone {zone['zone_id']}"
                )
            longitude = rng.uniform(minimum_x, maximum_x)
            latitude = rng.uniform(minimum_y, maximum_y)
            if not geometry.covers(Point(longitude, latitude)):
                continue
            points.append(
                {
                    "x_miles": round(
                        (longitude - origin_longitude) * miles_per_degree_longitude, 6
                    ),
                    "y_miles": round((latitude - origin_latitude) * 69.0, 6),
                }
            )
        zone["sample_points"] = points

    return {
        "profile_id": "providence-rism-2015.v1",
        "city_id": "cbsa:39300",
        "kind": "public_model_proxy",
        "source_name": "Rhode Island Statewide Model high-employment TAZ layer",
        "source_url": SOURCE_URL,
        "source_period": "2015 model trip productions and attractions",
        "retrieved_at": "2026-09-27",
        "source_geography": "High-employment TAZs with Municipali=Providence; not the full municipality or CBSA",
        "raw_sha256": RAW_SHA256,
        "zone_count": len(zones),
        "zone_area_sq_miles": round(sum(zone["area_sq_miles"] for zone in zones), 6),
        "coordinate_origin_longitude": origin_longitude,
        "coordinate_origin_latitude": origin_latitude,
        "miles_per_degree_longitude": round(miles_per_degree_longitude, 8),
        "miles_per_degree_latitude": 69.0,
        "transformation": (
            "Production and attraction estimates weight separate zone selections. "
            "Each zone has 32 deterministic within-polygon sample locations for hypothetical pickups and dropoffs. "
            "Coordinates are converted to local miles around their production-weighted center."
        ),
        "limitations": [
            "RISM values are modeled 2015 trip productions and attractions, not observed ride-hail requests.",
            "The public layer contains only high-employment zones; it omits other Providence areas and the wider CBSA.",
            "The existing 1,000 assumed requests/day and 24 hourly weights remain synthetic and repeat for seven days.",
            "Pickup and dropoff points are generated inside actual zone polygons; they are not observed ride locations.",
            "Movement uses the simulation's straight-line distance assumption.",
        ],
        "zones": zones,
    }


def main() -> None:
    result = build(read_snapshot())
    encoded = (json.dumps(result, indent=2, sort_keys=True) + "\n").encode("utf-8")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT_PATH.exists() and OUTPUT_PATH.read_bytes() != encoded:
        raise ValueError(
            "Immutable Providence simulation profile differs from regenerated output"
        )
    OUTPUT_PATH.write_bytes(encoded)
    print(f"{OUTPUT_PATH} sha256={hashlib.sha256(encoded).hexdigest()}")


if __name__ == "__main__":
    main()
