# NGSIM adapter scaffold

Place a licensed/official corridor CSV under `data/raw/ngsim/`. `load()` requires trajectory identity, time, position, speed, acceleration, and lane fields. `process()` writes `data/processed/intermediate/ngsim_trajectories.parquet`. Geographic coverage is corridor-specific and is not used as nationwide city evidence. TODO: source downloader and explicit version adapters for the FHWA legacy file variants.
