"""Create tract-grain ACS table for future service-area and demand simulation."""
from pathlib import Path
import pandas as pd
from src.config.settings import PROCESSED
from .load import load_api_table

def build_tract_features(raw_paths: dict[str, Path], county_map) -> Path:
    """Retain full tract rows for each county in target CBSAs; no percent averaging occurs."""
    county_to_cbsa={str(r.county_geoid):str(r.cbsa_code) for r in county_map.itertuples(index=False)}
    frames=[]
    for path in raw_paths.values():
        frame=pd.DataFrame(load_api_table(path))
        if frame.empty: continue
        frame["county_geoid"]=frame.state.astype(str).str.zfill(2)+frame.county.astype(str).str.zfill(3)
        frame["tract_geoid"]=frame.county_geoid+frame.tract.astype(str).str.zfill(6)
        frame["cbsa_code"]=frame.county_geoid.map(county_to_cbsa)
        frames.append(frame[frame.cbsa_code.notna()])
    if not frames:
        raise ValueError("ACS tract inputs contained no target CBSA tracts")
    out=PROCESSED/"intermediate"/"tract_features.parquet"; out.parent.mkdir(parents=True,exist_ok=True)
    pd.concat(frames,ignore_index=True).to_parquet(out,index=False)
    return out
