"""Build the Providence map overlays from pinned City GIS Hub shapefiles.

Requires pyshp, pyproj, and shapely. Run from the repository root:
    python data/src/datasets/providence_gis/build.py
"""

from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path
import zipfile

import shapefile
from pyproj import CRS, Transformer
from shapely.geometry import mapping, shape


ROOT = Path(__file__).resolve().parents[4]
SNAPSHOTS = ROOT / "data" / "snapshots" / "providence_gis"
PUBLIC = ROOT / "apps" / "web" / "public" / "gis"
SOURCES = {
    "buildings": ("building-footprints.zip", "Buildings"),
    "roads": ("road-centerlines.zip", "Road_CenterLines"),
}


def rounded_coordinates(value):
    if isinstance(value[0], (int, float)):
        return [round(value[0], 6), round(value[1], 6)]
    return [rounded_coordinates(part) for part in value]


def build_layer(kind: str, archive_name: str, stem: str, expected_digest: str) -> tuple[int, int, str]:
    archive_path = SNAPSHOTS / archive_name
    with zipfile.ZipFile(archive_path) as archive:
        reader = shapefile.Reader(
            shp=io.BytesIO(archive.read(f"{stem}.shp")),
            shx=io.BytesIO(archive.read(f"{stem}.shx")),
            dbf=io.BytesIO(archive.read(f"{stem}.dbf")),
        )
        projection = CRS.from_wkt(archive.read(f"{stem}.prj").decode())
        transformer = Transformer.from_crs(projection, 4326, always_xy=True)
        features = []
        missing_height = 0
        for index in range(len(reader)):
            try:
                record = reader.shapeRecord(index)
            except shapefile.ShapefileException:
                continue
            attributes = record.record.as_dict()
            if record.shape.shapeType == shapefile.NULL:
                continue
            if kind == "buildings" and attributes.get("DEMO") == "YES":
                continue
            geometry = shape(record.shape.__geo_interface__)
            if not geometry.is_valid:
                geometry = geometry.buffer(0)
            if geometry.is_empty:
                continue
            geometry = geometry.simplify(1.5 if kind == "buildings" else 3)
            from shapely.ops import transform

            geometry = transform(transformer.transform, geometry)
            compact = mapping(geometry)
            compact["coordinates"] = rounded_coordinates(compact["coordinates"])
            if kind == "buildings":
                feet = attributes.get("BLDG_HGT")
                height = round(feet * 0.3048, 2) if feet and feet > 0 else None
                missing_height += height is None
                properties = {"height_m": height}
            else:
                properties = {"name": attributes.get("STR_ORIG") or ""}
            features.append(
                {
                    "type": "Feature",
                    "id": index,
                    "properties": properties,
                    "geometry": compact,
                }
            )
    payload = json.dumps(
        {"type": "FeatureCollection", "features": features}, separators=(",", ":")
    ).encode("utf-8")
    output_digest = hashlib.sha256(payload).hexdigest()
    if output_digest != expected_digest:
        raise ValueError(f"providence-{kind}.geojson: derived SHA-256 mismatch")
    output = PUBLIC / f"providence-{kind}.geojson"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(payload)
    return len(features), missing_height, output_digest


def main() -> None:
    metadata = json.loads((SNAPSHOTS / "manifest.json").read_text(encoding="utf-8"))
    for kind, (archive_name, stem) in SOURCES.items():
        digest = hashlib.sha256((SNAPSHOTS / archive_name).read_bytes()).hexdigest()
        if digest != metadata[kind]["sha256"]:
            raise ValueError(f"{archive_name}: snapshot SHA-256 mismatch")
        count, missing, output_digest = build_layer(
            kind, archive_name, stem, metadata[kind]["derived_sha256"]
        )
        print(f"{kind}: {count} features, {missing} missing heights, SHA-256 {output_digest}")


if __name__ == "__main__":
    main()
