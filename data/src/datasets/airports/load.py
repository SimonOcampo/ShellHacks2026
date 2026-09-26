"""Load BTS T-100 monthly segment passenger counts."""
from pathlib import Path
import pandas as pd

def load(path: Path) -> pd.DataFrame:
    """Read a CSV export and require airport identifiers and passenger fields."""
    frame=pd.read_csv(path,low_memory=False)
    required={"ORIGIN","PASSENGERS"}
    if not required<=set(frame.columns): raise ValueError(f"T-100 file missing columns: {required-set(frame.columns)}")
    return frame
