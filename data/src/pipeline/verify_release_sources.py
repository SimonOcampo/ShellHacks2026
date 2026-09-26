"""Reconcile a local verified release with preserved source snapshots."""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import math
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import geopandas as gpd
import pandas as pd

from contracts.models import DataRelease, RankingRequest
from odd_ranking.engine import rank
from odd_ranking.normalization import freeze_bounds
from src.datasets.acs.summary_file import inspect_margins
from src.datasets.acs.commute import TABLES as COMMUTE_TABLES, read_commutes
from src.datasets.noaa.download import _distance_km, _published_normal
from src.datasets.census_geography.load import load_layer
from src.datasets.census_geography.process import resolve_markets
from src.datasets.waymo.reference_markets import build as build_references

ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "data" / "data" / "raw"
PROCESSED = ROOT / "data" / "data" / "processed"
RELEASE = ROOT / "data" / "releases" / "verified.v1.json"
OUTPUT = ROOT / "data" / "audits" / "verified-source-checks.json"
CLIMATE_TYPES = {
    "annual_precipitation_mm": "ANN-PRCP-NORMAL",
    "annual_snowfall_mm": "ANN-SNOW-NORMAL",
    "hot_days_32c": "ANN-TMAX-AVGNDS-GRTH090",
}


def verify_manifest() -> dict:
    manifest = json.loads((PROCESSED / "manifests" / "data_manifest.json").read_text(encoding="utf-8"))
    retained = 0
    removed = 0
    for item in manifest["datasets"]:
        if item.get("retained", True) is False:
            removed += 1
            continue
        path = ROOT / item["raw_path"]
        if not path.is_file() or path.stat().st_size != item["bytes"]:
            raise ValueError(f"Missing or size-mismatched raw snapshot: {item['raw_path']}")
        if hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
            raise ValueError(f"Raw SHA-256 mismatch: {item['raw_path']}")
        retained += 1
    return {"retained_snapshot_hashes_verified": retained,
            "removed_road_snapshots_with_preserved_hashes": removed}


def verify_release_provenance(release: DataRelease) -> dict:
    manifest = json.loads((PROCESSED / "manifests" / "data_manifest.json").read_text(encoding="utf-8"))
    saved_hashes = {item["sha256"] for item in manifest["datasets"]}
    for table in COMMUTE_TABLES:
        path = RAW / "acs" / "summary_file" / f"acsdt5y2024-{table}.dat"
        if path.exists():
            saved_hashes.add(hashlib.sha256(path.read_bytes()).hexdigest())
    sources = [source for city in release.cities for source in city.provenance]
    missing = sorted({source.raw_sha256 for source in sources} - saved_hashes)
    if missing:
        raise ValueError(f"Release provenance hashes absent from manifest: {missing}")
    return {"provenance_records_resolved": len(sources),
            "distinct_source_hashes_resolved": len({source.raw_sha256 for source in sources})}


def verify_frozen_bounds(release: DataRelease) -> dict:
    cities = {city.city_id: city for city in release.cities}
    expected = freeze_bounds(cities, release.features, release.normalization_cohort)
    if expected != release.bounds:
        raise ValueError("Release normalization bounds differ from its frozen complete cohort")
    return {"scoring_features_checked": len(expected),
            "complete_cohort_cities_checked": len(release.normalization_cohort)}


def verify_noaa(release: DataRelease) -> dict:
    rows = {}
    paths = sorted((RAW / "noaa" / "validation").glob("selected_station_attributes_*.json"))
    if not paths:
        raise ValueError("Flagged NOAA validation snapshots are absent")
    for path in paths:
        for row in json.loads(path.read_text(encoding="utf-8")):
            rows[row["STATION"]] = row
    flags = collections.Counter()
    observations = 0
    for city in release.cities:
        provenance = {item.id: item for item in city.provenance}
        for feature, datatype in CLIMATE_TYPES.items():
            values = []
            for provenance_id in city.features[feature].provenance_ids:
                item = provenance[provenance_id]
                if not item.dataset_id.startswith("normals"):
                    continue
                station = parse_qs(urlparse(item.source_url).query)["stations"][0]
                row = rows.get(station)
                if row is None:
                    raise ValueError(f"Missing flagged NOAA station: {station}")
                value = _published_normal(row, datatype)
                if value is None:
                    raise ValueError(f"Invalid NOAA value or flags: {city.city_id} {feature} {station}")
                values.append(value)
                measurement_flag = str(row[f"meas_flag_{datatype}"]).strip() or "blank"
                completeness_flag = str(row[f"comp_flag_{datatype}"]).strip()
                flags[f"{measurement_flag}/{completeness_flag}"] += 1
                observations += 1
            if not values:
                raise ValueError(f"Missing NOAA source observation: {city.city_id} {feature}")
            expected = sum(values) / len(values) if feature == "hot_days_32c" else values[0] * 25.4
            if not math.isclose(city.features[feature].value, expected, rel_tol=0, abs_tol=1e-8):
                raise ValueError(f"NOAA conversion mismatch: {city.city_id} {feature}")
    return {"stations_with_attributes": len(rows), "used_observations_verified": observations,
            "measurement_and_completeness_flags": dict(sorted(flags.items())),
            "units_requested": "standard; precipitation and snowfall inches converted to mm"}


def verify_noaa_station_selection(release: DataRelease) -> dict:
    """Recheck nearest reporting stations against the preserved NOAA inventory."""
    inventory_pages = sorted((RAW / "noaa").glob("station_inventory_1991-2020_*.json"))
    if len(inventory_pages) != 8:
        raise ValueError("Expected eight preserved NOAA station inventory pages")
    stations = {}
    for path in inventory_pages:
        for feature in json.loads(path.read_text(encoding="utf-8"))["features"]:
            row = feature["attributes"]
            try:
                station = str(row["STATION_ID"])
                latitude = float(row["LATITUDE"])
                longitude = float(row["LONGITUDE"])
            except (KeyError, TypeError, ValueError):
                continue
            if station.startswith(("USC", "USW")) and -90 <= latitude <= 90 and -180 <= longitude <= 180:
                if station in stations and stations[station] != (latitude, longitude):
                    raise ValueError(f"Conflicting NOAA inventory coordinates: {station}")
                stations[station] = (latitude, longitude)

    attributed = {}
    for path in sorted((RAW / "noaa" / "validation").glob("selected_station_attributes_*.json")):
        attributed.update({row["STATION"]: row for row in json.loads(path.read_text(encoding="utf-8"))})
    closer_path = RAW / "noaa" / "validation" / "closer_station_attributes_00.json"
    closer_rows = json.loads(closer_path.read_text(encoding="utf-8"))
    if len(closer_rows) != 10 or any(_published_normal(row, "ANN-SNOW-NORMAL") is not None
                                     for row in closer_rows):
        raise ValueError("Closer-station NOAA snowfall evidence changed")
    closer = {row["STATION"]: row for row in closer_rows}
    if len(closer) != len(closer_rows):
        raise ValueError("Duplicate closer-station NOAA evidence")

    response_cache = {}

    def reported(station: str, datatype: str) -> bool:
        key = (station, datatype)
        if key not in response_cache:
            row = attributed.get(station, closer.get(station))
            if row is None:
                stem = (f"{station}_1991-2020_ge90f.json" if datatype == CLIMATE_TYPES["hot_days_32c"]
                        else f"{station}_1991-2020.json")
                folder = "hot_days" if datatype == CLIMATE_TYPES["hot_days_32c"] else "normals"
                path = RAW / "noaa" / folder / stem
                if not path.exists():
                    raise ValueError(f"Closer NOAA station has no preserved response: {station} {datatype}")
                payload = json.loads(path.read_text(encoding="utf-8"))
                row = payload[0] if isinstance(payload, list) and payload else {}
            value = _published_normal(row, datatype)
            response_cache[key] = value is not None and (datatype != CLIMATE_TYPES["hot_days_32c"] or value <= 366)
        return response_cache[key]

    checked = 0
    for city in release.cities:
        provenance = {item.id: item for item in city.provenance}
        distances = sorted(
            ((_distance_km(city.latitude, city.longitude, *coords), station)
             for station, coords in stations.items()),
            key=lambda item: (item[0], item[1]),
        )
        for feature, datatype in CLIMATE_TYPES.items():
            selected = [parse_qs(urlparse(provenance[source_id].source_url).query)["stations"][0]
                        for source_id in city.features[feature].provenance_ids
                        if provenance[source_id].dataset_id.startswith("normals")]
            if len(selected) != (3 if feature == "hot_days_32c" else 1):
                raise ValueError(f"Unexpected NOAA station count: {city.city_id} {feature}")
            if any(station not in stations for station in selected):
                raise ValueError(f"Selected NOAA station absent from inventory: {city.city_id} {feature}")
            radius = max(_distance_km(city.latitude, city.longitude, *stations[station])
                         for station in selected)
            if radius > 100:
                raise ValueError(f"Selected NOAA station exceeds 100 km: {city.city_id} {feature}")
            reporting = [station for distance, station in distances
                         if distance <= radius + 1e-9 and reported(station, datatype)]
            if reporting[:len(selected)] != selected:
                raise ValueError(f"NOAA station selection mismatch: {city.city_id} {feature}: "
                                 f"{selected} versus {reporting[:len(selected)]}")
            checked += 1
    return {"inventory_stations_checked": len(stations),
            "city_feature_selections_checked": checked,
            "closer_nonreporting_snowfall_stations_checked": len(closer)}


def verify_acs(release: DataRelease) -> dict:
    corrected = all(
        {f"acs_summary_2024_{table}" for table in COMMUTE_TABLES}
        <= {source.dataset_id for source in city.provenance
            if source.id in city.features["mean_commute_minutes"].provenance_ids}
        for city in release.cities
    )
    paths = {table: RAW / "acs" / "summary_file" / f"acsdt5y2024-{table}.dat"
             for table in ("b01003", "b08201", "b08301", *(COMMUTE_TABLES if corrected else ("b08136",)))}
    codes = {city.city_id.removeprefix("cbsa:") for city in release.cities}
    commutes = read_commutes(paths, codes) if corrected else None
    margins = inspect_margins(paths, codes)
    profile_fallback = []
    for city in release.cities:
        code = city.city_id.removeprefix("cbsa:")
        tables = margins[code]
        pop = tables["b01003"]["B01003_E001"]["value"]
        households = tables["b08201"]["B08201_E001"]["value"]
        zero = tables["b08201"]["B08201_E002"]["value"]
        workers = tables["b08301"]["B08301_E001"]["value"]
        transit = tables["b08301"]["B08301_E010"]["value"]
        for key, expected in (("population", pop),
                              ("zero_vehicle_household_share", zero / households),
                              ("transit_commute_share", transit / workers)):
            if not math.isclose(city.features[key].value, expected, rel_tol=0, abs_tol=1e-10):
                raise ValueError(f"ACS estimate mismatch: {city.city_id} {key}")
        if commutes is not None:
            if not math.isclose(city.features["mean_commute_minutes"].value,
                                commutes[code]["mean_commute_minutes"], rel_tol=0, abs_tol=1e-10):
                raise ValueError(f"ACS matching-universe commute mismatch: {city.city_id}")
        elif "b08136" in tables:
            commute = tables["b08136"]["B08136_E001"]["value"] / workers
            if not math.isclose(city.features["mean_commute_minutes"].value, commute,
                                rel_tol=0, abs_tol=1e-10):
                raise ValueError(f"ACS commute mismatch: {city.city_id}")
        else:
            profile_fallback.append(code)
    profile_paths = sorted((RAW / "acs").glob("acs5_2024_profile_DP03_0025E_targeted_*.json"))
    valid_profiles = []
    for path in profile_paths:
        try:
            rows = json.loads(path.read_text(encoding="utf-8"))
            if rows[0][1] == "DP03_0025E":
                valid_profiles.append((path, rows))
        except (ValueError, IndexError, KeyError, TypeError):
            continue
    if profile_fallback:
        if not valid_profiles:
            raise ValueError("Saved Census profile commute source is absent")
        values = {row[-1]: float(row[1]) for row in valid_profiles[-1][1][1:]}
        cities = {city.city_id.removeprefix("cbsa:"): city for city in release.cities}
        for code in profile_fallback:
            if not math.isclose(cities[code].features["mean_commute_minutes"].value,
                                values[code], rel_tol=0, abs_tol=1e-10):
                raise ValueError(f"ACS profile commute mismatch: {code}")
    return {"cbsa_estimates_checked": len(codes),
            "controlled_population_total_moes": sum(
                row["b01003"]["B01003_M001"]["status"] == "controlled_total"
                for row in margins.values()),
            "max_zero_vehicle_numerator_moe_fraction": max(
                row["b08201"]["B08201_M002"]["value"] /
                row["b08201"]["B08201_E002"]["value"]
                for row in margins.values()),
            "max_transit_numerator_moe_fraction": max(
                row["b08301"]["B08301_M010"]["value"] /
                row["b08301"]["B08301_E010"]["value"]
                for row in margins.values()),
            "summary_commute_moes_reported": len(codes) if corrected else sum("b08136" in row for row in margins.values()),
            "matching_universe_commutes": len(codes) if corrected else 0,
            "profile_commute_estimates_without_saved_moe": sorted(profile_fallback)}


def verify_afdc(release: DataRelease) -> dict:
    payload = json.loads((RAW / "afdc" / "active_us_public_electric_stations.json").read_text(encoding="utf-8"))
    stations = payload["fuel_stations"]
    ids = [station["id"] for station in stations]
    if len(ids) != len(set(ids)):
        raise ValueError("AFDC raw snapshot has duplicate station IDs")
    qualifying = {}
    for station in stations:
        if station.get("status_code") != "E" or str(station.get("access_code", "")).lower() != "public":
            continue
        if station.get("latitude") is None or station.get("longitude") is None:
            continue
        values = station.get("ev_dc_fast_num")
        values = values if isinstance(values, list) else [values]
        ports = sum(int(value) for value in values if value is not None)
        if ports > 0:
            qualifying[station["id"]] = (ports, float(station["latitude"]), float(station["longitude"]))
    sites = gpd.read_parquet(PROCESSED / "intermediate" / "charging_sites.parquet")
    if sites.station_id.duplicated().any():
        raise ValueError("Processed charging sites duplicate an AFDC station ID")
    for site in sites.itertuples(index=False):
        if qualifying.get(site.station_id) != (site.dc_fast_ports, site.latitude, site.longitude):
            raise ValueError(f"AFDC site or port count mismatch: {site.station_id}")
    cbsa = gpd.read_parquet(PROCESSED / "intermediate" / "cbsa_boundaries.parquet")
    counties = gpd.read_file(RAW / "census" / "county_2024.zip").to_crs(sites.crs)
    nationwide = gpd.GeoDataFrame(
        {"station_id": list(qualifying)},
        geometry=gpd.points_from_xy(
            [item[2] for item in qualifying.values()],
            [item[1] for item in qualifying.values()]),
        crs=sites.crs,
    )
    expected_sites = gpd.sjoin(nationwide, cbsa[["GEOID", "geometry"]],
                               how="inner", predicate="within")
    if set(expected_sites.station_id) != set(sites.station_id):
        raise ValueError("AFDC CBSA join omitted or added a qualifying station")
    for polygons, key, recorded in ((cbsa, "GEOID", "cbsa_code"),
                                    (counties, "GEOID", "county_geoid")):
        matches = gpd.sjoin(sites[["station_id", "geometry"]], polygons[[key, "geometry"]],
                            how="left", predicate="within")
        assigned = matches.dropna(subset=[key]).set_index("station_id")[key].astype(str).to_dict()
        if any(assigned.get(site.station_id) != str(getattr(site, recorded))
               for site in sites.itertuples(index=False)):
            raise ValueError(f"AFDC {recorded} point assignment mismatch")
    ports_by_cbsa = sites.groupby("cbsa_code").dc_fast_ports.sum().to_dict()
    county_members = pd.read_parquet(PROCESSED / "intermediate" / "cbsa_counties.parquet")
    county_to_cbsa = dict(zip(county_members.county_geoid.astype(str),
                              county_members.cbsa_code.astype(str)))
    population_rows = pd.read_csv(
        RAW / "acs" / "summary_file" / "acsdt5y2024-b01003.dat", sep="|",
        usecols=["GEO_ID", "B01003_E001"], dtype={"GEO_ID": "string"}, low_memory=False)
    county_population = {}
    for row in population_rows.loc[population_rows.GEO_ID.str.startswith("0500000US")].itertuples(index=False):
        county = str(row.GEO_ID).removeprefix("0500000US")
        if county in county_to_cbsa:
            county_population[county] = int(row.B01003_E001)
    charging_counties = {
        str(code): set(group.county_geoid.dropna().astype(str))
        for code, group in sites.groupby("cbsa_code")
    }
    for city in release.cities:
        code = city.city_id.removeprefix("cbsa:")
        expected = ports_by_cbsa.get(code, 0) / city.features["population"].value * 100000
        if not math.isclose(city.features["public_dc_ports_per_100k"].value, expected,
                            rel_tol=0, abs_tol=1e-9):
            raise ValueError(f"AFDC city port-rate mismatch: {code}")
        members = [county for county, cbsa_code in county_to_cbsa.items() if cbsa_code == code]
        if any(county not in county_population for county in members):
            raise ValueError(f"Missing ACS county population for charging coverage: {code}")
        covered = sum(county_population[county] for county in members
                      if county in charging_counties.get(code, set()))
        population = sum(county_population[county] for county in members)
        coverage = covered / population
        if not math.isclose(city.features["population_share_in_counties_with_dc"].value,
                            coverage, rel_tol=0, abs_tol=1e-10):
            raise ValueError(f"AFDC county coverage mismatch: {code}")
    return {"raw_station_rows": len(stations), "raw_unique_station_ids": len(set(ids)),
            "qualifying_public_operational_dc_sites_nationwide": len(qualifying),
            "joined_sites_verified": len(sites), "joined_dc_ports_verified": int(sites.dc_fast_ports.sum()),
            "cbsa_and_county_assignments_verified": True,
            "all_qualifying_sites_in_configured_cbsas_accounted_for": True,
            "county_population_coverage_verified": True}


def verify_references(release: DataRelease) -> dict:
    markets = resolve_markets(load_layer(RAW / "census" / "cbsa_2024.zip"))
    from_source, _ = build_references(markets, persist=False)
    expected = {(ref.id, f"cbsa:{ref.city_id}", ref.category, ref.enabled)
                for ref in from_source}
    actual = {(ref.id, ref.city_id, ref.category, ref.enabled)
              for ref in release.references}
    if actual != expected:
        raise ValueError("Release reference statuses differ from preserved Waymo page")
    dates = sorted({ref.status_as_of for ref in release.references})
    return {"reference_markets_matched_to_preserved_official_page": len(actual),
            "enabled_commercial": sum(ref.enabled and ref.category == "commercial"
                                      for ref in release.references),
            "status_as_of": dates}


def build_report(release_path: Path = RELEASE) -> dict:
    release_bytes = release_path.read_bytes()
    release = DataRelease.model_validate_json(release_bytes)
    ranking = rank(release, RankingRequest())
    if len(ranking.ranked) < 8 or ranking.unranked:
        raise ValueError("Verified release does not satisfy target ranking gate")
    acs = verify_acs(release)
    limitations = []
    if acs["profile_commute_estimates_without_saved_moe"]:
        limitations.append("The saved Census DP03 profile extract has estimates but no DP03_0025M MOEs for five fallback commutes.")
        if acs["summary_commute_moes_reported"]:
            limitations.append("Five profile commute estimates and 30 summary-file ratios use different methods.")
    if any("developer.nrel.gov" in source.source_url for city in release.cities for source in city.provenance):
        limitations.append("The immutable verified.v1 release cites the retired developer.nrel.gov AFDC host; the current source is developer.nlr.gov.")
    return {"release_path": release_path.relative_to(ROOT).as_posix(),
            "release_sha256": hashlib.sha256(release_bytes).hexdigest(),
            "default_ranking_id": ranking.ranking_id,
            "ranked_candidates": len(ranking.ranked),
            "enabled_references": sum(ref.enabled for ref in release.references),
            "manifest": verify_manifest(),
            "release_provenance": verify_release_provenance(release),
            "frozen_bounds": verify_frozen_bounds(release),
            "noaa": verify_noaa(release),
            "noaa_station_selection": verify_noaa_station_selection(release),
            "acs": acs, "afdc": verify_afdc(release),
            "references": verify_references(release),
            "publication_limitations": limitations}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", type=Path, default=RELEASE)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    report = build_report(args.release.resolve())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Checked {report['ranked_candidates']} candidates, "
          f"{report['noaa']['used_observations_verified']} NOAA observations, "
          f"{report['afdc']['joined_sites_verified']} AFDC sites; "
          f"limitations={len(report['publication_limitations'])}")


if __name__ == "__main__":
    main()
