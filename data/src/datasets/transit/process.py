"""Preserve useful agency GTFS detail as simulation-ready intermediate tables."""
from pathlib import Path
import pandas as pd
from src.config.settings import PROCESSED

def process(feeds: dict[str, dict[str, pd.DataFrame]]) -> Path:
    """Preserve each available feed table at source grain with a feed ID column."""
    grouped: dict[str, list[pd.DataFrame]] = {}
    for feed_id, feed_tables in feeds.items():
        for table, frame in feed_tables.items():
            tagged=frame.copy(); tagged["feed_id"]=feed_id
            grouped.setdefault(table, []).append(tagged)
    target=PROCESSED/"intermediate"; target.mkdir(parents=True,exist_ok=True)
    for table, frames in grouped.items():
        pd.concat(frames,ignore_index=True).to_parquet(target/f"transit_{table}.parquet",index=False)
    return target/"transit_stops.parquet"
