"""Aggregate T-100 segment passenger values while preserving month and carrier."""
from src.config.settings import PROCESSED

def process(frame, output=None):
    """Write source-grain airport/carrier/time passengers for service-area generation."""
    target=output or PROCESSED/"intermediate"/"airport_features.parquet"; target.parent.mkdir(parents=True,exist_ok=True)
    frame.to_parquet(target,index=False)
    return target
