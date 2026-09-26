"""Spatially join FRA crossing locations to CBSA and preserve inventory rows."""
import geopandas as gpd
from src.common.geography import assign_points
from src.config.settings import PROCESSED

def process(crossings, cbsa_boundaries: gpd.GeoDataFrame, output=None):
    """Point-join crossing records after identifying source latitude/longitude columns."""
    lat=next((c for c in crossings if c.lower() in {"latitude","lat"}),None); lon=next((c for c in crossings if c.lower() in {"longitude","lon","long"}),None)
    if not lat or not lon: raise ValueError("FRA source has no latitude/longitude columns")
    points=gpd.GeoDataFrame(crossings,geometry=gpd.points_from_xy(crossings[lon],crossings[lat]),crs="EPSG:4326")
    points["cbsa_code"]=assign_points(points,cbsa_boundaries,"GEOID")
    target=output or PROCESSED/"intermediate"/"fra_crossing_features.parquet"; target.parent.mkdir(parents=True,exist_ok=True)
    points[points.cbsa_code.notna()].to_parquet(target,index=False)
    return target
