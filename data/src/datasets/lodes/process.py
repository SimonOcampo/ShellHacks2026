"""Preserve tract-joinable OD flows for future simulation."""
from pathlib import Path
import pandas as pd
from src.config.settings import PROCESSED

def process(frames: list[pd.DataFrame]) -> Path:
    """Concatenate state OD files and write block-level flows, without city-level loss."""
    out = PROCESSED / "intermediate" / "lodes_od.parquet"; out.parent.mkdir(parents=True, exist_ok=True)
    pd.concat(frames, ignore_index=True).to_parquet(out, index=False)
    return out
