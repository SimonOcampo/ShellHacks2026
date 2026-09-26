"""Build validated CBSA-level feature records from raw verified inputs."""
from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path
import json, logging
import pandas as pd
from src.common.provenance import provenance
from src.common.validation import write_city
from src.config.cities import CANDIDATES, REFERENCES
from src.config.settings import ACS_YEAR, GEOGRAPHY_YEAR, MODEL_VERSION, PROCESSED, RAW
from src.contracts.models import CityFeature, Measurement, VersionStamp
from src.datasets.acs.process import process as process_acs
from src.datasets.acs.download import download as download_acs
from src.datasets.acs.download import download_tracts
from src.datasets.acs.intermediate import build_tract_features as build_api_tract_features
from src.datasets.acs.summary_file import download as download_acs_summary, process as process_acs_summary, build_tract_features as build_summary_tract_features, TABLES as ACS_SUMMARY_TABLES
from src.datasets.afdc.download import download as download_afdc
from src.datasets.afdc.load import load as load_afdc
from src.datasets.afdc.process import process as process_afdc
from src.datasets.census_geography.download import download as download_geography
from src.datasets.census_geography.load import load_layer
from src.datasets.census_geography.process import build_catalog, resolve_markets
from src.datasets.noaa.download import download_market_normals
from src.datasets.noaa.process import missing_climate_features, process_market_normals
from src.datasets.roads.download import download as download_road_edges
from src.datasets.roads.process import process as process_road_edges, write_intermediate as write_road_intermediate
from src.datasets.waymo.reference_markets import build as build_references
from src.common.hashing import sha256_file
from src.pipeline.export_city_features_excel import export_city_features_excel

log = logging.getLogger(__name__)

def _manifest_path(path: Path) -> str:
    """Return one consistent workspace-relative path for raw-artifact manifests."""
    return path.resolve().relative_to(Path.cwd().resolve()).as_posix()

def _measurement(value, unit: str, pid: str | list[str] | None, *, quality="derived", reason=None) -> Measurement:
    if value is None:
        return Measurement(value=None, unit=unit, quality="missing", missing_reason=reason or "Source value unavailable.", provenance_ids=[])
    return Measurement(value=float(value), unit=unit, quality=quality, missing_reason=None, provenance_ids=([pid] if isinstance(pid,str) else pid) if pid else [])

def build_all(*, download: bool = False, city_keys: list[str] | None = None) -> list[CityFeature]:
    """Download required sources on request and generate JSON plus combined outputs."""
    if download:
        geography_files = download_geography()
    else:
        geography_files = {name: (str(RAW / "census" / f"{name}_{GEOGRAPHY_YEAR}.zip"), "") for name in ("cbsa", "county")}
    cbsa_zip, county_zip = Path(geography_files["cbsa"][0]), Path(geography_files["county"][0])
    cbsa = load_layer(cbsa_zip)
    markets = resolve_markets(cbsa)
    boundaries, county_map = build_catalog(cbsa_zip, county_zip)
    county_shapes = load_layer(county_zip)
    roads_error = None
    if download:
        try:
            download_road_edges(county_map)
        except (RuntimeError, OSError, ValueError) as exc:
            roads_error = str(exc)
            log.warning("Some TIGER/Line road snapshots could not be downloaded: %s", exc)
    roads_values = {}
    roads_provenance = {}
    county_members = {
        str(code): sorted(county_map.loc[county_map.cbsa_code.astype(str) == str(code), "county_geoid"].astype(str).tolist())
        for code in county_map.cbsa_code.astype(str).unique()
    }
    roads_dir = RAW / "roads" / f"tiger_{GEOGRAPHY_YEAR}"
    if roads_dir.exists() and any(roads_dir.glob(f"tl_{GEOGRAPHY_YEAR}_*_edges.zip")):
        road_cache = PROCESSED / "intermediate" / "road_network_features.parquet"
        expected_codes = set(county_members)
        expected_counties = {county for counties in county_members.values() for county in counties}
        cached = False
        if road_cache.exists() and all((roads_dir / f"tl_{GEOGRAPHY_YEAR}_{county.zfill(5)}_edges.zip").exists() for county in expected_counties):
            try:
                cached_frame = pd.read_parquet(road_cache)
                if set(cached_frame["cbsa_code"].astype(str)) == expected_codes:
                    roads_values = cached_frame.set_index("cbsa_code").to_dict(orient="index")
                    cached = True
                    log.info("Reusing validated road intermediate for %d configured CBSAs and %d county snapshots", len(expected_codes), len(expected_counties))
            except (OSError, ValueError, KeyError) as exc:
                log.warning("Road intermediate cache is not reusable; recomputing: %s", exc)
        if not cached:
            roads_values = process_road_edges(boundaries, county_map)
            write_road_intermediate(roads_values)
        for code, counties in county_members.items():
            records = []
            for county in counties:
                source = roads_dir / f"tl_{GEOGRAPHY_YEAR}_{county.zfill(5)}_edges.zip"
                if source.exists():
                    records.append(provenance(
                        source_name="U.S. Census TIGER/Line All Lines county edges",
                        source_url=f"https://www2.census.gov/geo/tiger/TIGER{GEOGRAPHY_YEAR}/EDGES/tl_{GEOGRAPHY_YEAR}_{county.zfill(5)}_edges.zip",
                        dataset_id=f"tiger_edges_{GEOGRAPHY_YEAR}_{county.zfill(5)}",
                        period=str(GEOGRAPHY_YEAR),
                        raw_path=source,
                        source_geography=f"Census county {county}",
                        target_geography=f"Census CBSA {code}",
                        transformation=f"Select unique ROADFLG topological edges from the CBSA's complete member counties, project to {roads_values[code]['projected_crs']}, and aggregate qualifying MTFCC edge lengths and TNID endpoint degrees.",
                        assumptions=["TIGER All Lines contains unique topological edges rather than duplicate named road features.", "CBSAs are composed of whole member counties, so no within-county polygon clipping is applied.", "Freeway proxy=S1100+S1630; arterial proxy=S1200; local/residual=S1400+S1640+S1730.", "Intersections count distinct endpoint TNIDs with degree >=3; nearby qualifying nodes within 20 m are merged; nodes within 5 m of the CBSA boundary are excluded.", "All member counties must be present for the CBSA network to be complete."],
                    ))
            roads_provenance[code] = records
    state_codes = sorted({code for row in boundaries.state_fips for code in row})
    api_paths = {"metro": RAW / "acs" / f"acs5_{ACS_YEAR}_cbsa_keyed.json", "county": RAW / "acs" / f"acs5_{ACS_YEAR}_county_keyed.json", "profile": RAW / "acs" / f"acs5_{ACS_YEAR}_profile_cbsa_keyed.json"}
    api_tract_paths = {fips: RAW / "acs" / f"acs5_{ACS_YEAR}_tract_state_{fips}.json" for fips in state_codes}
    use_api = bool(__import__("os").getenv("CENSUS_API_KEY"))
    api_data = None
    if download and use_api:
        try:
            metro_path, county_path, profile_path = download_acs()
            tract_paths = download_tracts(set(state_codes))
            acs = process_acs(Path(metro_path), Path(county_path), Path(profile_path), county_map)
            if all(path.exists() for path in tract_paths.values()): build_api_tract_features(tract_paths, county_map)
            api_data = (metro_path, county_path, profile_path, acs)
        except (RuntimeError, OSError, ValueError) as exc:
            log.warning("Census API unavailable (%s); falling back to official ACS Summary Files.", type(exc).__name__)
    if api_data is not None:
        metro_path, county_path, profile_path, acs = api_data
    elif not download and use_api and all(path.exists() for path in api_paths.values()):
        metro_path, county_path, profile_path = api_paths["metro"], api_paths["county"], api_paths["profile"]
        tract_paths = api_tract_paths
        acs = process_acs(metro_path, county_path, profile_path, county_map)
        if all(path.exists() for path in tract_paths.values()): build_api_tract_features(tract_paths, county_map)
    else:
        summary_paths = download_acs_summary() if download else {table: RAW / "acs" / "summary_file" / f"acsdt5y{ACS_YEAR}-{table}.dat" for table in ACS_SUMMARY_TABLES}
        if any(not path.exists() for path in summary_paths.values()):
            raise RuntimeError("ACS source files are absent. Rebuild with --download to fetch the official Census Summary File, or set CENSUS_API_KEY to use the API.")
        acs = process_acs_summary(summary_paths, county_map)
        build_summary_tract_features(summary_paths, county_map)
        metro_path = county_path = profile_path = None
        tract_paths = {}
    requested = set(city_keys or [key for key, _ in CANDIDATES + REFERENCES])
    valid = {key for key, _ in CANDIDATES + REFERENCES}
    unknown = requested - valid
    if unknown:
        raise ValueError(f"Unknown market keys: {sorted(unknown)}")

    provenance_rows = []
    cbsa_prov = provenance(source_name="U.S. Census TIGER/Line CBSA", source_url="https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_cbsa_500k.zip", dataset_id=f"tiger_cbsa_{GEOGRAPHY_YEAR}", period=str(GEOGRAPHY_YEAR), raw_path=cbsa_zip, source_geography="CBSA polygon", target_geography="official CBSA", transformation="TIGER/Line CBSA code and polygon; representative point on surface in EPSG:5070 transformed to WGS84.", assumptions=["CBSA land area sums Census county ALAND for every county assigned by county representative point.", "Coordinates are a representative point, not a population-weighted centroid."])
    county_prov = provenance(source_name="U.S. Census TIGER/Line Counties", source_url="https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_county_500k.zip", dataset_id=f"tiger_county_{GEOGRAPHY_YEAR}", period=str(GEOGRAPHY_YEAR), raw_path=county_zip, source_geography="County polygons and ALAND", target_geography="CBSA county membership", transformation="County representative point spatially joined to official CBSA polygons; county ALAND summed for land area.", assumptions=["CBSAs are composed of whole counties."])
    if metro_path is not None:
        acs_prov = provenance(source_name="U.S. Census ACS 5-Year", source_url=f"https://api.census.gov/data/{ACS_YEAR}/acs/acs5", dataset_id=f"acs5_{ACS_YEAR}", period=str(ACS_YEAR), raw_path=Path(metro_path), source_geography="CBSA estimates", target_geography="CBSA", transformation="Use published estimates and calculate ratios from their corresponding universes.", assumptions=["B08201_002E/B08201_001E is zero-vehicle household share; B08301_010E/B08301_001E is transit commute share."])
        commute_prov = provenance(source_name="U.S. Census ACS 5-Year Data Profiles", source_url=f"https://api.census.gov/data/{ACS_YEAR}/acs/acs5/profile", dataset_id=f"acs5_profile_{ACS_YEAR}", period=str(ACS_YEAR), raw_path=Path(profile_path), source_geography="CBSA", target_geography="CBSA", transformation="Use Census-reported DP03_0025E mean travel time to work in minutes.", assumptions=["Published profile estimate is used directly."])
        vehicle_prov = worker_prov = acs_prov
        acs_sources = [("acs5_cbsa", Path(metro_path)), ("acs5_county", Path(county_path)), ("acs5_profile", Path(profile_path))]
        provenance_rows.extend([acs_prov, commute_prov])
    else:
        acs_provs = {}
        for table, source in summary_paths.items():
            acs_provs[table] = provenance(source_name="U.S. Census ACS 5-Year Summary File", source_url=f"https://www2.census.gov/programs-surveys/acs/summary_file/{ACS_YEAR}/table-based-SF/data/5YRData/acsdt5y{ACS_YEAR}-{table}.dat", dataset_id=f"acs_summary_{ACS_YEAR}_{table}", period=str(ACS_YEAR), raw_path=source, source_geography="CBSA, county, and census tract estimates", target_geography="official CBSA and member counties", transformation=f"Extract GEO_ID estimates from table {table}; calculate ratios from their published universes.", assumptions=["Only published estimates are used; negative sentinel values are unavailable."])
            provenance_rows.append(acs_provs[table])
        acs_prov, vehicle_prov, worker_prov, commute_prov = acs_provs["b01003"], acs_provs["b08201"], acs_provs["b08301"], acs_provs["b08136"]
        acs_sources = [(f"acs_summary_{table}", source) for table, source in summary_paths.items()]
    provenance_rows.extend([cbsa_prov, county_prov])
    afdc_values = {}
    afdc_prov = None
    noaa_values = {}
    if download:
        try:
            noaa_values = process_market_normals(download_market_normals(boundaries))
        except Exception as exc:
            log.warning("NOAA normals unavailable; climate measurements will be explicit missing values: %s", exc)
    noaa = missing_climate_features()
    if download:
        try:
            afdc_path, _ = download_afdc()
            afdc_values = process_afdc(load_afdc(afdc_path), boundaries, county_shapes)
            afdc_prov = provenance(source_name="U.S. DOE Alternative Fuels Data Center", source_url="https://developer.nrel.gov/api/alt-fuel-stations/v1.json", dataset_id="afdc_active_public_electric", period=datetime.now(timezone.utc).date().isoformat(), raw_path=afdc_path, source_geography="Station coordinates", target_geography="Census CBSA and counties", transformation="Count active public stations' reported DC fast ports after point-in-polygon joins to CBSA and counties.", assumptions=["Station status must be E and access must be public.", "Only reported DC fast port counts are used; stations with no reported port count are excluded."])
            provenance_rows.append(afdc_prov)
        except (RuntimeError, OSError, ValueError) as exc:
            log.warning("AFDC unavailable; recording explicit missing measurements: %s", exc)

    reference_records, waymo_prov = build_references(markets)
    provenance_rows.append(waymo_prov)

    names = dict(CANDIDATES + REFERENCES)
    boundaries_by_code = {str(row.GEOID): row for _, row in boundaries.iterrows()}
    output = []
    missing_reason_afdc = "AFDC public DC charging source was not retrieved; no zero substitution was made. Set NREL_API_KEY and rebuild."
    for key in requested:
        geo = markets[key]; code = geo["cbsa_code"]
        row = boundaries_by_code[code]
        stats = acs.get(code)
        if not stats or stats["population"] <= 0:
            raise RuntimeError(f"ACS data missing or invalid for official CBSA {code} ({names[key]}). See preserved Census response.")
        area = float(row.land_area_km2)
        if area <= 0:
            raise ValueError(f"Invalid Census land area for CBSA {code}: {area}")
        dc = afdc_values.get(code) if afdc_prov else None
        # A successful nationwide snapshot with no CBSA hits is evidence of zero; an unavailable
        # source remains None and is represented as missing below.
        if afdc_prov and dc is None:
            dc = {"public_dc_ports": 0, "county_ports": {}}
        county_pops = stats["county_populations"]
        charging_counties = set((dc or {}).get("county_ports", {}))
        coverage_denominator = sum(county_pops.values())
        coverage = (sum(pop for county, pop in county_pops.items() if county in charging_counties) / coverage_denominator) if dc is not None and coverage_denominator > 0 and len(county_pops) == int((county_map.cbsa_code == code).sum()) else None
        feats = {
            "population": _measurement(stats["population"], "persons", acs_prov.id, quality="observed"),
            "population_density_per_km2": _measurement(stats["population"] / area, "persons/km2", acs_prov.id),
            "mean_commute_minutes": _measurement(stats["mean_commute_minutes"], "minutes", commute_prov.id, quality="observed", reason="ACS mean commute estimate unavailable."),
            "zero_vehicle_household_share": _measurement(stats["zero_vehicle_household_share"], "fraction of households", vehicle_prov.id),
            "transit_commute_share": _measurement(stats["transit_commute_share"], "fraction of workers 16+", worker_prov.id),
            "public_dc_ports_per_100k": _measurement((dc["public_dc_ports"] / stats["population"] * 100_000) if dc is not None else None, "ports/100,000 persons", afdc_prov.id if afdc_prov else None, reason=missing_reason_afdc),
            "population_share_in_counties_with_dc": _measurement(coverage, "fraction of CBSA population", afdc_prov.id if afdc_prov else None, reason=missing_reason_afdc if dc is None else "ACS county population or charging-county membership is incomplete."),
        }
        road_stats = roads_values.get(code, {})
        road_provs = roads_provenance.get(code, [])
        road_ids = [item.id for item in road_provs]
        road_complete = len(road_provs) == len(county_members.get(code, [])) and bool(road_stats)
        road_missing = roads_error or "TIGER/Line road snapshots are missing for one or more CBSA member counties; no partial-network values were substituted."
        road_features = [
            ("road_density_km_per_km2", "km/km2"),
            ("intersection_density_per_km2", "intersections/km2"),
            ("freeway_share", "fraction"),
            ("arterial_share", "fraction"),
            ("local_road_share", "fraction"),
        ]
        if road_complete:
            for feature, unit in road_features:
                feats[feature] = _measurement(road_stats[feature], unit, road_ids, quality="derived", reason="No qualifying TIGER road edges were present.")
        else:
            for feature, unit in road_features:
                feats[feature] = Measurement(value=None, unit=unit, quality="missing", missing_reason=road_missing, provenance_ids=[])
        hpms_missing = "No current, complete segment-level FHWA AADT and through-lane layer was available in the retrieved TIGER snapshots. The public HPMS geospatial release is legacy and coverage-limited; these metrics remain missing rather than being extrapolated."
        feats["average_aadt"] = Measurement(value=None, unit="vehicles/day", quality="missing", missing_reason=hpms_missing, provenance_ids=[])
        feats["lane_miles_per_km2"] = Measurement(value=None, unit="lane-miles/km2", quality="missing", missing_reason=hpms_missing, provenance_ids=[])
        climate = noaa_values.get(code, {})
        if climate:
            climate_ids=[p.id for p in climate["normal_provenance"]]
            feats["annual_precipitation_mm"] = _measurement(climate["annual_precipitation_mm"], "mm/year", climate_ids, quality="proxy", reason="NOAA station precipitation normal is blank.")
            feats["annual_snowfall_mm"] = _measurement(climate["annual_snowfall_mm"], "mm/year", climate_ids, quality="proxy", reason="NOAA station snowfall normal is blank.")
            feats["hot_days_32c"] = _measurement(climate["hot_days_32c"], "days/year", [p.id for p in climate.get("hot_day_provenance", [])], quality="proxy", reason=climate.get("hot_days_missing_reason"))
            city_provenance = provenance_rows.copy() + climate["provenance"] + road_provs
        else:
            for climate_key, item in noaa.items():
                feats[climate_key] = Measurement(value=None, unit=item["unit"], quality="missing", missing_reason=item["missing_reason"], provenance_ids=[])
            city_provenance = provenance_rows.copy() + road_provs
        states = sorted(set(row.state_codes or []))
        output.append(CityFeature(versions=VersionStamp(schema_version="1", data_version=f"{ACS_YEAR}-acs5__{GEOGRAPHY_YEAR}-tiger__NOAA-{__import__('os').getenv('ODD_SCOUT_NOAA_PERIOD','1991-2020')}__TIGER-edges-{GEOGRAPHY_YEAR}__AFDC-current", model_version=MODEL_VERSION, data_mode="verified"), city_id=code, display_name=names[key], official_name=str(row.NAME), geography_type="cbsa", geography_vintage=str(GEOGRAPHY_YEAR), state_codes=states, latitude=float(row.latitude), longitude=float(row.longitude), features=feats, legal_evidence=[], provenance=city_provenance))

    city_dir = PROCESSED / "cities"; city_dir.mkdir(parents=True, exist_ok=True)
    for city in output:
        write_city(city, city_dir / f"{city.city_id}.json")
    payload = [city.model_dump(mode="json") for city in output]
    (city_dir / "all_city_features.json").write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    export_city_features_excel(city_dir / "all_city_features.json", city_dir / "all_city_features.xlsx")
    frame = pd.DataFrame([{**{k: v for k, v in c.model_dump(mode="json").items() if k not in ("features", "provenance")}, **{f"{k}_value": m.value for k, m in c.features.items()}, **{f"{k}_quality": m.quality for k, m in c.features.items()}} for c in output])
    frame.to_parquet(city_dir / "all_city_features.parquet", index=False)
    manifest = {"built_at": datetime.now(timezone.utc).isoformat(), "data_mode":"verified", "records":len(output), "datasets":[], "warnings":[], "row_counts":{"city_features":len(output),"reference_markets":len(reference_records),"cbsa_catalog":len(boundaries),"cbsa_counties":len(county_map)}}
    for dataset, source in [("tiger_cbsa", cbsa_zip), ("tiger_county", county_zip), *acs_sources, ("afdc", RAW / "afdc" / "active_us_public_electric_stations.json"), ("waymo_markets", RAW / "waymo" / "rides.html")]:
        if source.exists():
            manifest["datasets"].append({"dataset":dataset,"raw_path":_manifest_path(source),"sha256":sha256_file(source),"bytes":source.stat().st_size})
    for state, source in tract_paths.items():
        if source.exists(): manifest["datasets"].append({"dataset":"acs5_tract","state_fips":state,"raw_path":_manifest_path(source),"sha256":sha256_file(source),"bytes":source.stat().st_size})
    for source in (RAW / "noaa").rglob("*"):
        if source.is_file() and source.suffix.lower()==".json": manifest["datasets"].append({"dataset":"noaa_climate_normals","raw_path":_manifest_path(source),"sha256":sha256_file(source),"bytes":source.stat().st_size})
    if roads_dir.exists():
        for source in roads_dir.rglob("*.zip"):
            manifest["datasets"].append({"dataset":f"tiger_edges_{GEOGRAPHY_YEAR}","raw_path":_manifest_path(source),"sha256":sha256_file(source),"bytes":source.stat().st_size})
    if not afdc_prov:
        manifest["warnings"].append("AFDC was not retrieved; charging measurements are missing.")
    if not noaa_values:
        manifest["warnings"].append("NOAA normals were not retrieved; three climate measurements are missing for every market.")
    else:
        if any(city.features["hot_days_32c"].value is None for city in output):
            manifest["warnings"].append("NOAA >=90 F hot-day normals are missing for one or more markets; see per-city missing_reason fields.")
    if any(city.features["average_aadt"].value is None for city in output):
        manifest["warnings"].append("Average AADT and lane-miles density are explicitly missing because complete comparable segment-level HPMS inputs were not ingested.")
    expected_outputs=["cities/*.json","cities/all_city_features.json","cities/all_city_features.xlsx","cities/all_city_features.parquet","reference_markets/reference_markets.json","reference_markets/reference_markets_provenance.json","intermediate/cbsa_catalog.parquet","intermediate/cbsa_boundaries.parquet","intermediate/cbsa_counties.parquet","intermediate/charging_sites.parquet","intermediate/tract_features.parquet","intermediate/road_network_features.parquet","intermediate/osm_road_features.parquet","intermediate/fars_by_geography.parquet","intermediate/transit_stops.parquet","intermediate/airport_features.parquet","intermediate/fra_crossing_features.parquet"]
    manifest["processed_outputs"]=[name for name in expected_outputs if (PROCESSED/name).exists() or "*" in name]
    man_dir=PROCESSED/"manifests"; man_dir.mkdir(parents=True,exist_ok=True)
    (man_dir/"data_manifest.json").write_text(json.dumps(manifest,indent=2),encoding="utf-8")
    return output

if __name__ == "__main__":
    import argparse
    parser=argparse.ArgumentParser(); parser.add_argument("--validate",action="store_true"); parser.add_argument("--cities",nargs="+")
    args=parser.parse_args(); cities=build_all(city_keys=args.cities)
    print(f"Validated {len(cities)} CityFeature records")
