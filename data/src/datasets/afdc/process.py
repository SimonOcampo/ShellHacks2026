"""Identify qualifying public DC fast ports and export site-level intermediates."""
from pathlib import Path
import pandas as pd
from shapely.geometry import Point
import geopandas as gpd
from src.common.geography import assign_points
from src.config.settings import PROCESSED

DC_LEVELS = {"DC Fast", "DC Fast Charger", "DC Fast Charging"}

def process(stations: list[dict], cbsa_boundaries: gpd.GeoDataFrame, county_boundaries: gpd.GeoDataFrame) -> dict[str, dict]:
    """Count active public DC ports; use point-in-CBSA and preserve charging sites."""
    rows = []
    for s in stations:
        if s.get("status_code") != "E" or str(s.get("access_code", "")).lower() != "public":
            continue
        lat, lon = s.get("latitude"), s.get("longitude")
        if lat is None or lon is None:
            continue
        ports = 0
        for item in s.get("ev_dc_fast_num", []) if isinstance(s.get("ev_dc_fast_num"), list) else [s.get("ev_dc_fast_num")]:
            try:
                ports += int(item)
            except (ValueError, TypeError):
                pass
        if ports > 0:
            rows.append({"station_id": s.get("id"), "station_name": s.get("station_name"), "latitude": float(lat), "longitude": float(lon), "dc_fast_ports": ports, "state": s.get("state")})
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
