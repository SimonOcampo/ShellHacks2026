"""Identify qualifying public DC fast ports and export site-level intermediates."""
from pathlib import Path
import pandas as pd
from shapely.geometry import Point
import geopandas as gpd
from src.common.geography import assign_points
from src.config.settings import PROCESSED

DC_LEVELS = {"DC Fast", "DC Fast Charger", "DC Fast Charging"}

def qualifying_sites(stations: list[dict]) -> list[dict]:
    """Select each public operational DC station ID once."""
    rows = []
    seen: dict[int, tuple[float, float, int]] = {}
    for station in stations:
        if station.get("status_code") != "E" or str(station.get("access_code", "")).lower() != "public":
            continue
        lat, lon = station.get("latitude"), station.get("longitude")
        if lat is None or lon is None:
            continue
        values = station.get("ev_dc_fast_num")
        ports = 0
        for value in values if isinstance(values, list) else [values]:
            try:
                ports += int(value)
            except (ValueError, TypeError):
                pass
        if ports <= 0:
            continue
        station_id = station.get("id")
        if station_id is None:
            raise ValueError("Qualifying AFDC station has no ID")
        identity = (float(lat), float(lon), ports)
        if station_id in seen:
            if seen[station_id] != identity:
                raise ValueError(f"Conflicting AFDC records for station ID {station_id}")
            continue
        seen[station_id] = identity
        rows.append({"station_id": station_id, "station_name": station.get("station_name"),
                     "latitude": identity[0], "longitude": identity[1],
                     "dc_fast_ports": ports, "state": station.get("state")})
    return rows


def process(stations: list[dict], cbsa_boundaries: gpd.GeoDataFrame, county_boundaries: gpd.GeoDataFrame) -> dict[str, dict]:
    """Count active public DC ports; use point-in-CBSA and preserve charging sites."""
    rows = qualifying_sites(stations)
    sites = gpd.GeoDataFrame(rows, geometry=[Point(r["longitude"], r["latitude"]) for r in rows], crs="EPSG:4326")
    if len(sites):
        sites["cbsa_code"] = assign_points(sites, cbsa_boundaries, "GEOID")
        joined = sites[sites.cbsa_code.notna()].copy()
        joined["county_geoid"] = assign_points(joined, county_boundaries, "GEOID")
        by_cbsa = joined.groupby("cbsa_code").dc_fast_ports.sum().to_dict()
        by_county = joined.dropna(subset=["county_geoid"]).groupby(["cbsa_code", "county_geoid"]).dc_fast_ports.sum().to_dict()
    else:
        joined, by_cbsa, by_county = sites, {}, {}
    out = PROCESSED / "intermediate"; out.mkdir(parents=True, exist_ok=True)
    joined.to_parquet(out / "charging_sites.parquet", index=False)
    result = {str(code): {"public_dc_ports": int(ports), "county_ports": {str(county): int(n) for (cbsa, county), n in by_county.items() if str(cbsa) == str(code)}} for code, ports in by_cbsa.items()}
    return result
