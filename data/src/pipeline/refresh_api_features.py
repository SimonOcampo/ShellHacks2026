"""Refresh only ACS commute and AFDC charging features in existing city outputs."""
from __future__ import annotations

from datetime import date, datetime, timezone
import json
import logging
import os
from pathlib import Path

import geopandas as gpd
import pandas as pd

from src.common.http import fetch
from src.common.provenance import provenance
from src.common.validation import write_city
from src.config.settings import ACS_YEAR, GEOGRAPHY_YEAR, PROCESSED, RAW
from src.contracts.models import CityFeature, Measurement
from src.datasets.acs.load import load_api_table
from src.datasets.acs.summary_file import _read as read_summary_table
from src.datasets.afdc.download import download as download_afdc
from src.datasets.afdc.load import load as load_afdc
from src.datasets.afdc.process import process as process_afdc
from src.datasets.census_geography.load import load_layer

log = logging.getLogger(__name__)
CITY_DIR = PROCESSED / "cities"
MANIFEST_PATH = PROCESSED / "manifests" / "data_manifest.json"
COMMUTE_VARIABLE = "DP03_0025E"
CBSA_FIELD = "metropolitan statistical area/micropolitan statistical area"


def _download_commute_profile() -> Path:
    key = os.getenv("CENSUS_API_KEY")
    if not key:
        raise RuntimeError("CENSUS_API_KEY is required to refresh ACS mean commute values.")
    url = f"https://api.census.gov/data/{ACS_YEAR}/acs/acs5/profile"
    path, _ = fetch(
        url,
        RAW / "acs" / f"acs5_{ACS_YEAR}_profile_DP03_0025E_targeted_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json",
        params={
            "get": f"NAME,{COMMUTE_VARIABLE}",
            "for": f"{CBSA_FIELD}:*",
            "key": key,
        },
    )
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(rows, list) or not rows or COMMUTE_VARIABLE not in rows[0]:
            raise ValueError("Census response is not the expected ACS profile table")
    except (json.JSONDecodeError, ValueError) as exc:
        raise RuntimeError(f"Census did not return a valid ACS profile response; preserved response at {path}") from exc
    return path


def _save_combined(cities: list[CityFeature]) -> None:
    CITY_DIR.mkdir(parents=True, exist_ok=True)
    for city in cities:
        write_city(city, CITY_DIR / f"{city.city_id}.json")
    payload = [city.model_dump(mode="json") for city in cities]
    (CITY_DIR / "all_city_features.json").write_text(
        json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8"
    )
    frame = pd.DataFrame([
        {
            **{k: v for k, v in city.model_dump(mode="json").items() if k not in ("features", "provenance")},
            **{f"{key}_value": value.value for key, value in city.features.items()},
            **{f"{key}_quality": value.quality for key, value in city.features.items()},
        }
        for city in cities
    ])
    frame.to_parquet(CITY_DIR / "all_city_features.parquet", index=False)


def _update_manifest(artifacts: list[tuple[str, Path]]) -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    paths = {str(Path(item["raw_path"]).as_posix()) for item in manifest.get("datasets", [])}
    for dataset, path in artifacts:
        relative = path.resolve().relative_to(Path.cwd().resolve()).as_posix()
        if relative not in paths:
            from src.common.hashing import sha256_file
            manifest.setdefault("datasets", []).append({
                "dataset": dataset,
                "raw_path": relative,
                "sha256": sha256_file(path),
                "bytes": path.stat().st_size,
            })
    manifest["records"] = 35
    manifest["built_at"] = datetime.now(timezone.utc).isoformat()
    manifest["row_counts"]["city_features"] = 35
    manifest["warnings"] = [
        warning for warning in manifest.get("warnings", [])
        if not warning.startswith("AFDC was not retrieved")
    ]
    manifest["warnings"] = [warning for warning in manifest["warnings"] if "hot_days_32c is missing because" not in warning]
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def refresh(*, refresh_commute: bool = True, refresh_charging: bool = True) -> list[CityFeature]:
    """Fetch available API inputs and update only the affected fields in saved outputs."""
    raw_records = json.loads((CITY_DIR / "all_city_features.json").read_text(encoding="utf-8"))
    new_keys = {
        "road_density_km_per_km2": "km/km2",
        "intersection_density_per_km2": "intersections/km2",
        "average_aadt": "vehicles/day",
        "lane_miles_per_km2": "lane-miles/km2",
        "freeway_share": "fraction",
        "arterial_share": "fraction",
        "local_road_share": "fraction",
    }
    for record in raw_records:
        for key, unit in new_keys.items():
            record["features"].setdefault(key, {
                "value": None,
                "unit": unit,
                "quality": "missing",
                "missing_reason": "Road environment refresh has not been run for this saved release.",
                "provenance_ids": [],
            })
    cities = [CityFeature.model_validate(record) for record in raw_records]
    by_code = {city.city_id: city for city in cities}
    if len(by_code) != 35:
        raise ValueError(f"Expected 35 existing market records, found {len(by_code)}")
    artifacts: list[tuple[str, Path]] = []

    if refresh_commute:
        commute_path = _download_commute_profile()
        commute_rows = load_api_table(commute_path)
        commute_by_code = {
            str(row.get(CBSA_FIELD, "")).zfill(5): row.get(COMMUTE_VARIABLE)
            for row in commute_rows
        }
        commute_prov = provenance(
            source_name="U.S. Census ACS 5-Year Data Profiles",
            source_url=f"https://api.census.gov/data/{ACS_YEAR}/acs/acs5/profile",
            dataset_id=f"acs5_profile_{ACS_YEAR}_dp03_0025e",
            period=str(ACS_YEAR),
            raw_path=commute_path,
            source_geography="Census metropolitan and micropolitan statistical areas",
            target_geography="official Census CBSA",
            transformation="Use the published DP03_0025E mean travel time to work in minutes for the matching CBSA GEOID.",
            assumptions=["The Census-published ACS 5-year profile estimate is used directly."],
        )
        missing_before = 0
        updated = 0
        for city in cities:
            measurement = city.features["mean_commute_minutes"]
            if measurement.value is not None:
                continue
            missing_before += 1
            raw_value = commute_by_code.get(city.city_id)
            try:
                value = float(raw_value)
                if value < 0:
                    continue
            except (TypeError, ValueError):
                continue
            city.features["mean_commute_minutes"] = Measurement(
                value=value,
                unit="minutes",
                quality="observed",
                missing_reason=None,
                provenance_ids=[commute_prov.id],
            )
            if all(item.id != commute_prov.id for item in city.provenance):
                city.provenance.append(commute_prov)
            updated += 1
        artifacts.append(("acs5_profile_targeted_commute", commute_path))
        log.info("ACS commute: filled %d of %d previously missing values", updated, missing_before)

    if refresh_charging:
        afdc_path, _ = download_afdc()
        station_records = load_afdc(Path(afdc_path))
        cbsa_path = RAW / "census" / f"cbsa_{GEOGRAPHY_YEAR}.zip"
        county_path = RAW / "census" / f"county_{GEOGRAPHY_YEAR}.zip"
        cbsa_shapes = load_layer(cbsa_path)
        county_shapes = load_layer(county_path)
        # Restrict spatial joins to only the official market CBSAs in the saved catalog.
        market_codes = set(by_code)
        cbsa_shapes = cbsa_shapes[cbsa_shapes.GEOID.astype(str).isin(market_codes)].copy()
        port_counts = process_afdc(station_records, cbsa_shapes, county_shapes)

        # County population weights come from the already downloaded official ACS table.
        population_path = RAW / "acs" / "summary_file" / f"acsdt5y{ACS_YEAR}-b01003.dat"
        population_frame = read_summary_table(population_path, "b01003")
        county_to_cbsa = pd.read_parquet(PROCESSED / "intermediate" / "cbsa_counties.parquet")
        cbsa_by_county = {
            str(row.county_geoid): str(row.cbsa_code)
            for row in county_to_cbsa.itertuples(index=False)
        }
        county_population: dict[str, dict[str, int]] = {code: {} for code in market_codes}
        county_rows = population_frame[population_frame.GEO_ID.str.startswith("0500000US")]
        for row in county_rows.itertuples(index=False):
            county = str(row.GEO_ID).removeprefix("0500000US")
            cbsa = cbsa_by_county.get(county)
            if cbsa is None:
                continue
            try:
                estimate = float(getattr(row, "B01003_E001"))
            except (TypeError, ValueError):
                continue
            if estimate >= 0:
                county_population[cbsa][county] = int(estimate)

        afdc_prov = provenance(
            source_name="U.S. DOE Alternative Fuels Data Center / NLR Developer Network",
            source_url="https://developer.nlr.gov/api/alt-fuel-stations/v1.json",
            dataset_id="afdc_active_us_public_electric_stations",
            period=date.today().isoformat(),
            raw_path=Path(afdc_path),
            source_geography="Station coordinates and reported access/status/EVSE fields",
            target_geography="official Census CBSA and member counties",
            transformation="Filter active public stations, count reported DC fast ports, and point-in-polygon join to CBSA and county boundaries.",
            assumptions=[
                "Only stations with status E and access public are counted.",
                "Only reported DC fast port counts are used; null counts contribute no ports.",
                "County population coverage uses published ACS county population estimates.",
            ],
        )
        station_period = f"{ACS_YEAR}-acs5__{GEOGRAPHY_YEAR}-tiger__AFDC-{date.today().isoformat()}"
        for city in cities:
            code = city.city_id
            ports = int(port_counts.get(code, {}).get("public_dc_ports", 0))
            population = city.features["population"]
            population_ids = population.provenance_ids
            if all(item.id != afdc_prov.id for item in city.provenance):
                city.provenance.append(afdc_prov)
            source_ids = list(dict.fromkeys([afdc_prov.id, *population_ids]))
            city.features["public_dc_ports_per_100k"] = Measurement(
                value=ports / population.value * 100_000,
                unit="ports/100,000 persons",
                quality="derived",
                missing_reason=None,
                provenance_ids=source_ids,
            )
            member_count = int((county_to_cbsa.cbsa_code.astype(str) == code).sum())
            populations = county_population.get(code, {})
            denominator = sum(populations.values())
            if denominator > 0 and len(populations) == member_count:
                charged_counties = set(port_counts.get(code, {}).get("county_ports", {}))
                coverage = sum(pop for county, pop in populations.items() if county in charged_counties) / denominator
                city.features["population_share_in_counties_with_dc"] = Measurement(
                    value=coverage,
                    unit="fraction of CBSA population",
                    quality="derived",
                    missing_reason=None,
                    provenance_ids=source_ids,
                )
            else:
                city.features["population_share_in_counties_with_dc"] = Measurement(
                    value=None,
                    unit="fraction of CBSA population",
                    quality="missing",
                    missing_reason="ACS county population estimates are incomplete for this CBSA.",
                    provenance_ids=[],
                )
            city.versions.data_version = f"{city.versions.data_version.split('__AFDC-')[0]}__AFDC-{date.today().isoformat()}"
        artifacts.append(("afdc_active_public_electric", Path(afdc_path)))

    for city in cities:
        CityFeature.model_validate(city.model_dump(mode="json"))
    _save_combined(cities)
    _update_manifest(artifacts)
    return cities


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-commute", action="store_true", help="Do not request the ACS commute profile")
    parser.add_argument("--no-charging", action="store_true", help="Do not request AFDC stations")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cities = refresh(refresh_commute=not args.no_commute, refresh_charging=not args.no_charging)
    print(f"Refreshed targeted API features for {len(cities)} city records")


if __name__ == "__main__":
    main()
