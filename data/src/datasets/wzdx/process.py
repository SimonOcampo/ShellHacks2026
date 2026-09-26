"""WZDx intermediate scaffold."""
import pandas as pd
from src.config.settings import PROCESSED

def process(features: list[dict]):
    """Normalize saved feature properties without inventing absent lane/time values."""
    rows=[{"geometry":f.get("geometry"),**f.get("properties",{})} for f in features]
    target=PROCESSED/"intermediate"/"wzdx_work_zones.parquet"; target.parent.mkdir(parents=True,exist_ok=True)
    pd.DataFrame(rows).to_parquet(target,index=False); return target
