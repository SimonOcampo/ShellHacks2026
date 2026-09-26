# WZDx adapter scaffold

Save agency WZDx GeoJSON feed snapshots under `data/raw/wzdx/`. The loader validates a GeoJSON FeatureCollection and processing retains properties plus geometry in `data/processed/intermediate/wzdx_work_zones.parquet`. TODO: agency feed registry, schema-version adapters, deduplication, and CBSA spatial join. Coverage is agency-dependent.
