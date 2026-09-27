import hashlib
import json

from shapely.geometry import Point, shape
from src.datasets.rism.build_simulation_profile import (
    OUTPUT_PATH,
    RAW_PATH,
    RAW_SHA256,
    build,
)


def test_providence_profile_replays_pinned_source_and_stays_in_zones():
    raw = RAW_PATH.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == RAW_SHA256
    profile = build(raw)
    assert profile == json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    assert profile["zone_count"] == 86
    source_zones = {
        str(feature["properties"]["TAZ"]): shape(feature["geometry"])
        for feature in json.loads(raw)["features"]
    }
    for zone in profile["zones"]:
        geometry = source_zones[zone["zone_id"]]
        for sample in zone["sample_points"]:
            longitude = (
                profile["coordinate_origin_longitude"]
                + sample["x_miles"] / profile["miles_per_degree_longitude"]
            )
            latitude = (
                profile["coordinate_origin_latitude"]
                + sample["y_miles"] / profile["miles_per_degree_latitude"]
            )
            assert geometry.covers(Point(longitude, latitude))
