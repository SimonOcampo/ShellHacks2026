"""Load FARS accident CSV while retaining source column names."""
from pathlib import Path
from zipfile import ZipFile
import pandas as pd

def load_accidents(archive: Path) -> pd.DataFrame:
    """Read the accident table from an official FARS archive."""
    with ZipFile(archive) as zf:
        name = next((n for n in zf.namelist() if "accident" in n.lower() and n.lower().endswith(".csv")), None)
        if name is None:
            raise ValueError(f"No accident CSV found in {archive}")
        with zf.open(name) as stream:
            return pd.read_csv(stream, low_memory=False)
