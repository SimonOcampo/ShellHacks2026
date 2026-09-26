"""Load FRA crossing CSV data exports."""
from pathlib import Path
import pandas as pd

def load(path: Path) -> pd.DataFrame:
    """Read a FRA CSV and retain inventory fields."""
    return pd.read_csv(path,low_memory=False)
