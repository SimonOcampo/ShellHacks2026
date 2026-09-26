"""Load verified Census boundaries from their preserved ZIP archives."""
from pathlib import Path
import geopandas as gpd
import shapefile
from shapely.geometry import shape

def load_layer(path: Path) -> gpd.GeoDataFrame:
    """Read one TIGER/Line zip archive with GeoPandas."""
    reader = shapefile.Reader(str(path))
    fields = [field[0] for field in reader.fields[1:]]
    records, geometries = [], []
    for record, shp in zip(reader.records(), reader.shapes()):
        records.append(dict(zip(fields, record)))
        geometries.append(shape(shp.__geo_interface__))
    # Census TIGER/Line geometries are NAD83 geographic coordinates.
    frame = gpd.GeoDataFrame(records, geometry=geometries, crs="EPSG:4269")
    return frame.to_crs("EPSG:4326")
