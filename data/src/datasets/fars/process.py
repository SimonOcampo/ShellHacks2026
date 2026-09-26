"""Preserve raw FARS crash locations; joins are limited to valid coordinate rows."""
from pathlib import Path
import geopandas as gpd
from src.config.settings import PROCESSED
from src.common.geography import assign_points

def process(accidents, cbsa_boundaries: gpd.GeoDataFrame) -> Path:
    """Spatially assign geocoded crash rows to CBSAs and preserve event-level detail."""
    lat = next((x for x in ("LATITUDE", "LATITUDE_1") if x in accidents.columns), None)
    lon = next((x for x in ("LONGITUD", "LONGITUDE", "LONGITUDE_1") if x in accidents.columns), None)
    if lat is None or lon is None:
        raise ValueError("FARS accident table has no recognized latitude/longitude columns")
    frame = accidents.copy()
    frame[lat] = __import__("pandas").to_numeric(frame[lat], errors="coerce")
    frame[lon] = __import__("pandas").to_numeric(frame[lon], errors="coerce")
    frame = frame.dropna(subset=[lat, lon])
    points = gpd.GeoDataFrame(frame, geometry=gpd.points_from_xy(frame[lon], frame[lat]), crs="EPSG:4326")
    points["cbsa_code"] = assign_points(points, cbsa_boundaries, "GEOID")
    points = points[points.cbsa_code.notna()]
    out = PROCESSED / "intermediate" / "fars_by_geography.parquet"; out.parent.mkdir(parents=True, exist_ok=True)
    points.to_parquet(out, index=False)
    return out
