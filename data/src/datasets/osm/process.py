"""Persist OSM road edge attributes for network and routing analysis."""
from src.config.settings import PROCESSED

def process(edges, output=None):
    """Write road geometries and source tags without aggregating away network detail."""
    target = output or PROCESSED / "intermediate" / "osm_road_features.parquet"
    target.parent.mkdir(parents=True, exist_ok=True)
    edges.to_parquet(target, index=False)
    return target
