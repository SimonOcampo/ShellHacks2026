# Waymo Open Motion Dataset adapter scaffold

WOMD is reference-only and is not a source of nationwide city features. Obtain data under Waymo's current access terms, preserve the original files in `data/raw/waymo/motion/`, then provide a normalized parquet with scenario, track, timestamp, actor type, position, heading, and velocity fields to `motion_dataset.load()`. TODO: official TFRecord/protobuf decoder and official release metadata. No example rows are generated.
