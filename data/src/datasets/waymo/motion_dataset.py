"""Scaffold for licensed Waymo Open Motion Dataset research data."""
from pathlib import Path
import pandas as pd
from src.config.settings import RAW, PROCESSED

RAW_DIR = RAW / "waymo" / "motion"
EXPECTED_COLUMNS = ["scenario_id", "track_id", "timestamp_micros", "object_type", "x", "y", "heading", "velocity_x", "velocity_y"]

def load(path: Path) -> pd.DataFrame:
    """Load a researcher-provided normalized WOMD parquet; no sample values are generated."""
    if not path.exists():
        raise FileNotFoundError(f"Place permitted WOMD-derived parquet at {path}; raw source access/licensing is user-managed.")
    frame=pd.read_parquet(path)
    missing=set(EXPECTED_COLUMNS)-set(frame.columns)
    if missing: raise ValueError(f"WOMD normalized input missing expected columns: {sorted(missing)}")
    return frame

def process(frame: pd.DataFrame) -> Path:
    """Persist normalized trajectory rows while retaining scenario and track identity."""
    target=PROCESSED/"intermediate"/"waymo_motion.parquet"; target.parent.mkdir(parents=True,exist_ok=True)
    frame.to_parquet(target,index=False); return target
