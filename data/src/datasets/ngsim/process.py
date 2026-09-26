"""NGSIM intermediate schema scaffold; geographic coverage is corridor-specific."""
from src.config.settings import PROCESSED

def process(frame):
    """Preserve trajectory detail for behavior-model prototyping."""
    target=PROCESSED/"intermediate"/"ngsim_trajectories.parquet"; target.parent.mkdir(parents=True,exist_ok=True)
    frame.to_parquet(target,index=False); return target
