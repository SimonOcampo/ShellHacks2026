"""Geospatial joins that do not depend on a system GDAL or spatial-index install."""
import geopandas as gpd
from shapely.strtree import STRtree

def assign_points(points: gpd.GeoDataFrame, polygons: gpd.GeoDataFrame, polygon_key: str) -> list[str | None]:
    """Assign points to containing polygons with Shapely STRtree; preserves unmatched as None."""
    geoms = list(polygons.geometry)
    tree = STRtree(geoms)
    codes = []
    for point in points.geometry:
        matches = tree.query(point, predicate="within")
        codes.append(str(polygons.iloc[int(matches[0])][polygon_key]) if len(matches) else None)
    return codes
