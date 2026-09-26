"""Scaffold loader for FHWA NGSIM trajectory CSV exports."""
from pathlib import Path
import pandas as pd
EXPECTED_COLUMNS={"Vehicle_ID","Frame_ID","Global_Time","Local_X","Local_Y","v_Vel","v_Acc","Lane_ID"}

def load(path: Path) -> pd.DataFrame:
    """Load supplied NGSIM source CSV and validate trajectory identifiers/kinematics."""
    frame=pd.read_csv(path)
    missing=EXPECTED_COLUMNS-set(frame.columns)
    if missing: raise ValueError(f"NGSIM file missing expected fields: {sorted(missing)}")
    return frame
