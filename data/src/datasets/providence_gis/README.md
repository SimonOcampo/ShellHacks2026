# Providence GIS map context

The City of Providence GIS Hub publishes the two ArcGIS items pinned in
`data/snapshots/providence_gis/manifest.json`. The checked-in ZIP files are
immutable copies of those public Shapefiles. Their SHA-256 digests are checked
before deriving the two GeoJSON files in `apps/web/public/gis/`.

To rebuild the map assets, install `pyshp==3.1.6`, `pyproj==3.8.0`, and
`shapely==2.1.2` in a Python environment and run
`python data/src/datasets/providence_gis/build.py` from
the repository root. The script transforms the source State Plane coordinates
to WGS84, simplifies geometry by 1.5 feet for buildings and 3 feet for road
centerlines, and rounds output coordinates to six decimal places. The script
checks both source and derived SHA-256 digests from the manifest. It excludes
334 buildings flagged `DEMO=YES`, one null building geometry, and two malformed
road geometries. The derived files contain 52,271 buildings and 7,746 road
segments.

The building layer's `BLDG_HGT` values are interpreted as feet and converted
to meters for Mapbox extrusion. This interpretation follows the source's
State Plane feet coordinate system and elevation-difference lineage in its
metadata; vertical units are not independently confirmed. 1,753 surviving
building records lack a positive height and render flat. The source metadata
contains processing history going back to 2011. The 2025 ArcGIS item modified
date is a snapshot date, not proof that every footprint or height was surveyed
in 2025. The road centerlines now support display-only shortest paths between
the engine's endpoints. The engine still calculates timing and distance using
its existing assumptions; the path display does not change those results or
apply one-way and turn rules.

This map data does not establish a live Waymo service, road safety, or
deployment approval.
