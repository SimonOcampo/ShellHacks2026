"""Build CBSA road-network proxy measurements from Census TIGER topological edges."""
from __future__ import annotations

from collections import defaultdict
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from pathlib import Path
import math

import geopandas as gpd
import pandas as pd
from pyproj import Transformer
import shapely
from shapely.geometry import Point
from shapely.ops import transform

from src.config.settings import GEOGRAPHY_YEAR, PROCESSED, RAW

# Census MTFCC mapping: primary roads + ramps, secondary roads, local streets +
# service drives + alleys. Walkways, stairways, 4WD trails, private resource
# roads, and parking-lot roads are excluded from this drivable public-street proxy.
FREEWAY_CODES = {"S1100", "S1630"}
ARTERIAL_CODES = {"S1200"}
LOCAL_CODES = {"S1400", "S1640", "S1730"}
INCLUDED_CODES = FREEWAY_CODES | ARTERIAL_CODES | LOCAL_CODES
MILES_PER_KM = 0.621371192237334


def _utm_epsg(lon: float, lat: float) -> int:
    zone = max(1, min(60, int((lon + 180) // 6) + 1))
    return (32600 if lat >= 0 else 32700) + zone


def _clustered_junctions(lines, boundary, tolerance_m: float = 20.0) -> int:
    """Count endpoint clusters incident to >=3 distinct topological road edges."""
    endpoints = []
    for edge_id, line in enumerate(lines):
        parts = list(line.geoms) if line.geom_type == "MultiLineString" else [line]
        for part in parts:
            if part.is_empty or part.length <= 0:
                continue
            endpoints.append((edge_id, part.coords[0][:2]))
            endpoints.append((edge_id, part.coords[-1][:2]))
    if not endpoints:
        return 0

    parent = list(range(len(endpoints)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    cell_size = tolerance_m
    cells: dict[tuple[int, int], list[int]] = defaultdict(list)
    for index, (_, (x, y)) in enumerate(endpoints):
        cell = (math.floor(x / cell_size), math.floor(y / cell_size))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for other in cells.get((cell[0] + dx, cell[1] + dy), []):
                    ox, oy = endpoints[other][1]
                    if (x - ox) ** 2 + (y - oy) ** 2 <= tolerance_m**2:
                        union(index, other)
        cells[cell].append(index)

    incident: dict[int, set[int]] = defaultdict(set)
    coords: dict[int, list[tuple[float, float]]] = defaultdict(list)
    for index, (edge_id, xy) in enumerate(endpoints):
        root = find(index)
        incident[root].add(edge_id)
        coords[root].append(xy)
    count = 0
    for root, edges in incident.items():
        if len(edges) < 3:
            continue
        xy = coords[root]
        center = Point(sum(p[0] for p in xy) / len(xy), sum(p[1] for p in xy) / len(xy))
        # Clipping creates artificial CBSA-edge ends. Do not count those as nodes.
        if boundary.boundary.distance(center) > 5.0:
            count += 1
    return count


def _network_intersections(edges: dict[str, dict], boundary, tolerance_m: float = 20.0) -> int:
    """Count Census TNID network nodes of degree >=3, merging divided-road nodes."""
    incident: dict[str, set[str]] = defaultdict(set)
    coordinates: dict[str, tuple[float, float]] = {}
    for edge_id, edge in edges.items():
        for node_id, xy in edge.get("nodes", []):
            if node_id is None or str(node_id).strip() in {"", "0", "None"}:
                continue
            point = Point(xy)
            if not boundary.covers(point) or boundary.boundary.distance(point) <= 5.0:
                continue
            incident[str(node_id)].add(edge_id)
            coordinates[str(node_id)] = xy
    nodes = [node for node, edge_ids in incident.items() if len(edge_ids) >= 3]
    if not nodes:
        return 0
    parent = list(range(len(nodes)))

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    cells: dict[tuple[int, int], list[int]] = defaultdict(list)
    for index, node in enumerate(nodes):
        x, y = coordinates[node]
        cell = (math.floor(x / tolerance_m), math.floor(y / tolerance_m))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for other in cells.get((cell[0] + dx, cell[1] + dy), []):
                    ox, oy = coordinates[nodes[other]]
                    if (x - ox) ** 2 + (y - oy) ** 2 <= tolerance_m**2:
                        a, b = find(index), find(other)
                        if a != b:
                            parent[b] = a
        cells[cell].append(index)
    return len({find(index) for index in range(len(nodes))})


def _count_node_clusters(degree: dict[int, int], coordinates: dict[int, tuple[float, float]], boundary, tolerance_m: float = 20.0) -> int:
    """Count degree-three-or-higher Census nodes, consolidating divided-road pairs."""
    nodes = [
        node for node, count in degree.items()
        if count >= 3
        and boundary.covers(Point(coordinates[node]))
        and boundary.boundary.distance(Point(coordinates[node])) > 5.0
    ]
    parent = list(range(len(nodes)))

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    cells: dict[tuple[int, int], list[int]] = defaultdict(list)
    for index, node in enumerate(nodes):
        x, y = coordinates[node]
        cell = (math.floor(x / tolerance_m), math.floor(y / tolerance_m))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for other in cells.get((cell[0] + dx, cell[1] + dy), []):
                    ox, oy = coordinates[nodes[other]]
                    if (x - ox) ** 2 + (y - oy) ** 2 <= tolerance_m**2:
                        a, b = find(index), find(other)
                        if a != b:
                            parent[b] = a
        cells[cell].append(index)
    return len({find(index) for index in range(len(nodes))})


def process(boundaries: gpd.GeoDataFrame, county_map: gpd.GeoDataFrame, year: int = GEOGRAPHY_YEAR) -> dict[str, dict]:
    """Aggregate member-county TIGER edges with vectorized projected measurements.

    CBSA geography is county based in this release. Selecting its official member
    counties is the boundary clip; road centerlines are not duplicated by named
    feature records because the All Lines edge layer contains topological edges.
    """
    boundary_rows = {str(row.GEOID): row for _, row in boundaries.iterrows()}
    county_to_cbsa = {
        str(row.county_geoid).zfill(5): str(row.cbsa_code)
        for row in county_map.itertuples(index=False)
    }
    metric_state = {
        code: {
            "lengths": {"freeway": 0.0, "arterial": 0.0, "local": 0.0},
            "node_degree": defaultdict(int),
            "node_coordinates": {},
            "edge_count": 0,
        }
        for code in boundary_rows
    }
    projection_state = {}
    for cbsa_code, boundary_row in boundary_rows.items():
        epsg = _utm_epsg(float(boundary_row.longitude), float(boundary_row.latitude))
        project = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True).transform
        polygon = transform(project, boundary_row.geometry)
        projection_state[cbsa_code] = (epsg, polygon)

    def process_county(county: str, cbsa_code: str):
        path = RAW / "roads" / f"tiger_{year}" / f"tl_{year}_{county}_edges.zip"
        if not path.exists():
            return cbsa_code, None
        epsg = projection_state[cbsa_code][0]
        source = gpd.read_file(path)
        selected = source.loc[
            source.MTFCC.astype(str).isin(INCLUDED_CODES)
            & source.ROADFLG.astype(str).str.upper().isin({"Y", "1", "TRUE"})
        ].copy()
        if selected.empty:
            return cbsa_code, {"lengths": {"freeway": 0.0, "arterial": 0.0, "local": 0.0}, "edge_count": 0, "nodes": []}
        projected = selected.to_crs(epsg=epsg)
        mtfcc = projected.MTFCC.astype(str)
        lengths_km = projected.geometry.length / 1000.0
        lengths = {
            "freeway": float(lengths_km.loc[mtfcc.isin(FREEWAY_CODES)].sum()),
            "arterial": float(lengths_km.loc[mtfcc.isin(ARTERIAL_CODES)].sum()),
            "local": float(lengths_km.loc[mtfcc.isin(LOCAL_CODES)].sum()),
        }

        # TIGER TNIDF/TNIDT are network nodes, not geometry vertices. Extract
        # projected endpoint coordinates in vectorized Shapely operations.
        geometries = projected.geometry.array
        from_points = shapely.get_point(geometries, 0)
        to_points = shapely.get_point(geometries, -1)
        node_frame = pd.concat([
            pd.DataFrame({"node": projected.TNIDF.to_numpy(), "x": shapely.get_x(from_points), "y": shapely.get_y(from_points)}),
            pd.DataFrame({"node": projected.TNIDT.to_numpy(), "x": shapely.get_x(to_points), "y": shapely.get_y(to_points)}),
        ], ignore_index=True)
        node_frame["node"] = pd.to_numeric(node_frame.node, errors="coerce")
        node_frame = node_frame.dropna(subset=["node", "x", "y"])
        node_frame = node_frame.loc[node_frame.node > 0]
        grouped = node_frame.groupby("node", sort=False).agg(degree=("node", "size"), x=("x", "mean"), y=("y", "mean"))
        nodes = [(int(node_id), int(row.degree), float(row.x), float(row.y)) for node_id, row in grouped.iterrows()]
        return cbsa_code, {"lengths": lengths, "edge_count": int(len(projected)), "nodes": nodes}

    county_jobs = sorted(county_to_cbsa.items())
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(process_county, county, cbsa_code) for county, cbsa_code in county_jobs}
        while futures:
            done, _ = wait(futures, return_when=FIRST_COMPLETED)
            for future in done:
                cbsa_code, county_result = future.result()
                if county_result is not None:
                    state = metric_state[cbsa_code]
                    for key, value in county_result["lengths"].items():
                        state["lengths"][key] += value
                    state["edge_count"] += county_result["edge_count"]
                    for node_id, degree, x, y in county_result["nodes"]:
                        state["node_degree"][node_id] += degree
                        state["node_coordinates"].setdefault(node_id, (x, y))
                futures.remove(future)

    result = {}
    for cbsa_code, boundary_row in boundary_rows.items():
        state = metric_state[cbsa_code]
        lengths = state["lengths"]
        epsg = projection_state.get(cbsa_code, (_utm_epsg(float(boundary_row.longitude), float(boundary_row.latitude)), None))[0]
        total_km = sum(lengths.values())
        land_area_km2 = float(boundary_row.land_area_km2)
        polygon = projection_state.get(cbsa_code, (None, None))[1]
        intersections = _count_node_clusters(state["node_degree"], state["node_coordinates"], polygon) if polygon is not None else 0
        if total_km > 0 and land_area_km2 > 0:
            shares = {key: value / total_km for key, value in lengths.items()}
            result[cbsa_code] = {
                "road_density_km_per_km2": total_km / land_area_km2,
                "intersection_density_per_km2": intersections / land_area_km2,
                "freeway_share": shares["freeway"],
                "arterial_share": shares["arterial"],
                "local_road_share": shares["local"],
                "total_road_km": total_km,
                "freeway_road_km": lengths["freeway"],
                "arterial_road_km": lengths["arterial"],
                "local_residual_road_km": lengths["local"],
                "intersection_count": intersections,
                "land_area_km2": land_area_km2,
                "projected_crs": f"EPSG:{epsg}",
                "edge_count": state["edge_count"],
            }
        else:
            result[cbsa_code] = {
                "road_density_km_per_km2": None,
                "intersection_density_per_km2": None,
                "freeway_share": None,
                "arterial_share": None,
                "local_road_share": None,
                "total_road_km": 0.0,
                "freeway_road_km": 0.0,
                "arterial_road_km": 0.0,
                "local_residual_road_km": 0.0,
                "intersection_count": 0,
                "land_area_km2": land_area_km2,
                "projected_crs": f"EPSG:{epsg}",
                "edge_count": state["edge_count"],
            }
    return result


def write_intermediate(records: dict[str, dict], path: Path | None = None) -> Path:
    """Persist auditable per-CBSA road counts and coverage inputs."""
    target = path or PROCESSED / "intermediate" / "road_network_features.parquet"
    target.parent.mkdir(parents=True, exist_ok=True)
    frame = pd.DataFrame([{"cbsa_code": code, **values} for code, values in records.items()])
    frame.to_parquet(target, index=False)
    return target
