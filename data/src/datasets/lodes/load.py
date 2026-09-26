"""Stream LODES compressed OD files into typed pandas tables."""
from pathlib import Path
import pandas as pd

def load(path: Path) -> pd.DataFrame:
    """Read block-level LODES OD flows without dropping origin or destination block IDs."""
    frame = pd.read_csv(path, compression="gzip", dtype={"w_geocode":"string", "h_geocode":"string"})
    required = {"w_geocode", "h_geocode", "S000"}
    if not required <= set(frame.columns):
        raise ValueError(f"LODES file missing required fields: {required - set(frame.columns)}")
    return frame
