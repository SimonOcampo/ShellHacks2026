"""NOAA station climate-normal processing."""
from __future__ import annotations
from typing import Any
from pathlib import Path
from src.common.provenance import provenance
from src.common.units import inches_to_mm

def aggregate_hot_day_stations(stations: list[dict]) -> float | None:
    """Average NOAA station annual counts; never interpret an empty station set as zero."""
    values = [float(item["value"]) for item in stations if item.get("value") is not None]
    return sum(values) / len(values) if values else None

def missing_climate_features(reason: str = "NOAA station normals were not retrieved; no station observations are imputed.") -> dict[str, dict[str, Any]]:
    """Return contract-ready missing values; hot days require a faithful daily threshold series."""
    return {key: {"value": None, "quality": "missing", "missing_reason": reason, "unit": unit}
            for key, unit in [("annual_precipitation_mm", "mm/year"), ("annual_snowfall_mm", "mm/year"), ("hot_days_32c", "days/year")]}

def process_market_normals(records: dict[str, dict]) -> dict[str, dict]:
    """Convert NOAA annual normals and station-level 90 F annual hot-day normals."""
    result={}
    for cbsa,record in records.items():
        station_prov=provenance(source_name="NOAA NCEI Annual Normals Station Inventory",source_url=record["inventory_url"],dataset_id="noaa_normals_stations_1991-2020",period="1991-2020",raw_path=Path(record["inventory_path"]),source_geography="NOAA normals station points",target_geography=f"Census CBSA {cbsa}",transformation=f"Select station {record['station_id']} nearest to the CBSA representative point using great-circle distance.",assumptions=[f"Selected station is {record['distance_km']:.2f} km from the CBSA representative point."])
        prov=provenance(source_name="NOAA NCEI U.S. Climate Normals",source_url=record["source_url"],dataset_id="normals-annualseasonal-1991-2020",period="1991-2020",raw_path=Path(record["raw_path"]),source_geography=f"NOAA station {record['station_id']}",target_geography=f"Census CBSA {cbsa}",transformation="Convert annual precipitation and snowfall from inches to millimeters.",assumptions=["NOAA station annual precipitation and snowfall normals are in inches."])
        row=record["response"]
        def value(key):
            raw=row.get(key)
            if raw is None or not str(raw).strip(): return None
            return inches_to_mm(float(str(raw).strip()))
        hot_provenance = []
        hot_stations = record.get("hot_day_stations", [])
        for station in hot_stations:
            inventory = provenance(
                source_name="NOAA NCEI 1991-2020 Normals Station Inventory",
                source_url=station["inventory_url"],
                dataset_id="noaa_normals_stations_1991-2020",
                period="1991-2020",
                raw_path=Path(station["inventory_path"]),
                source_geography="NOAA normals station points",
                target_geography=f"Census CBSA {cbsa}",
                transformation=f"Select NOAA station {station['station_id']} within 100 km of the existing CBSA representative point using great-circle distance.",
                assumptions=[f"Station is {station['distance_km']:.2f} km from the CBSA representative point."],
            )
            normal = provenance(
                source_name="NOAA NCEI U.S. Climate Normals",
                source_url=station["source_url"],
                dataset_id="normals_annualseasonal_1991-2020_ann_tmax_avgn_day_ge90f",
                period="1991-2020",
                raw_path=Path(station["raw_path"]),
                source_geography=f"NOAA station {station['station_id']}",
                target_geography=f"Census CBSA {cbsa}",
                transformation="Use ANN-TMAX-AVGNDS-GRTH090, NOAA's 1991-2020 mean annual number of days with daily maximum temperature >= 90 F; average qualifying station counts for the CBSA proxy.",
                assumptions=["Threshold is exactly 90 F (32.222... C), not a rounded 32.0 C threshold.", "Station eligibility and climate-normal completeness follow NOAA's published normals product."],
            )
            hot_provenance.extend([inventory, normal])
        result[str(cbsa)]={
            "annual_precipitation_mm":value("ANN-PRCP-NORMAL"),
            "annual_snowfall_mm":value("ANN-SNOW-NORMAL"),
            "hot_days_32c":aggregate_hot_day_stations(hot_stations),
            "hot_days_missing_reason":None if hot_stations else "No NOAA 1991-2020 station with the annual >=90 F Tmax normal was found within 100 km of the CBSA representative point.",
            "hot_day_station_ids":[x["station_id"] for x in hot_stations],
            "hot_day_station_distances_km":[x["distance_km"] for x in hot_stations],
            "hot_day_provenance":hot_provenance,
            "normal_provenance":[station_prov,prov],
            "provenance":[station_prov,prov,*hot_provenance],
            "station_id":record["station_id"],
            "station_distance_km":record["distance_km"],
        }
    return result
