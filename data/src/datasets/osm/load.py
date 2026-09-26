"""OSM PBF loader interface."""
from pathlib import Path

def load_roads(path: Path):
    """Load road nodes and edges; install optional `pyrosm` to process PBF files."""
    try:
        from pyrosm import OSM
    except ImportError as exc:
        raise RuntimeError("Install the optional pyrosm package to parse Geofabrik PBF data") from exc
    osm = OSM(str(path))
    return osm.get_network(network_type="driving", nodes=True)
