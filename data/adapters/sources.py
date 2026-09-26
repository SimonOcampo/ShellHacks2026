"""Pure source transformations. Acquisition is explicit and separate."""

import math


def estimate(row, key):
    value = row.get(key)
    if value is None or value == "" or float(value) < 0:
        raise ValueError(f"Missing or suppressed ACS estimate: {key}")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"Nonfinite ACS estimate: {key}")
    return result


def acs_features(row, land_area_km2):
    """2024 ACS five-year table variables; duration midpoints are explicit assumptions."""
    if not math.isfinite(land_area_km2) or land_area_km2 <= 0:
        raise ValueError("Positive official land area required")
    population = estimate(row, "B01003_001E")
    households = estimate(row, "B08201_001E")
    commuters = estimate(row, "B08303_001E")
    workers = estimate(row, "B08301_001E")
    if min(population, households, commuters, workers) <= 0:
        raise ValueError("ACS denominators must be positive")
    midpoints = [2.5, 7, 12, 17, 22, 27, 32, 37, 42, 52, 74.5, 105]
    bins = [estimate(row, f"B08303_{i:03d}E") for i in range(2, 14)]
    if sum(bins) != commuters:
        raise ValueError("Commute bins do not reconcile to denominator")
    return {
        "population": population,
        "population_density_per_km2": population / land_area_km2,
        "zero_vehicle_household_share": estimate(row, "B08201_002E") / households,
        "transit_commute_share": estimate(row, "B08301_010E") / workers,
        "mean_commute_minutes": sum(
            n * midpoint for n, midpoint in zip(bins, midpoints)
        )
        / commuters,
    }


def haversine_km(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(math.radians, (lat1, lon1, lat2, lon2))
    d = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 6371 * 2 * math.asin(min(1, math.sqrt(d)))


def noaa_features(stations, latitude, longitude):
    """Input station records already decoded using the NOAA product's scale/flags.

    Values are in mm and days; the acquisition manifest records decoding.
    Never guess scale factors or treat negative sentinels as zero.
    """
    keys = ["annual_precipitation_mm", "annual_snowfall_mm", "hot_days_32c"]
    eligible = []
    for station in stations:
        if any(
            station.get(k) is None or not math.isfinite(station[k]) or station[k] < 0
            for k in keys
        ):
            continue
        distance = haversine_km(
            latitude, longitude, station["latitude"], station["longitude"]
        )
        if distance <= 100:
            eligible.append((distance, station["station_id"], station))
    selected = sorted(eligible, key=lambda item: item[:2])[:3]
    if not selected:
        raise ValueError("No complete qualifying NOAA stations within 100 km")
    values = {key: sum(s[key] for _, _, s in selected) / len(selected) for key in keys}
    return values, [
        {"station_id": sid, "distance_km": distance} for distance, sid, _ in selected
    ]


def charging_features(stations, county_populations, metro_population):
    """Stations must carry county_fips from an audited point-in-polygon join.

    County membership alone is insufficient for arbitrary service zones; this
    function is only for a frozen county-composed CBSA.
    """
    if metro_population <= 0 or sum(county_populations.values()) != metro_population:
        raise ValueError("County populations must reconcile to metro population basis")
    ports = 0
    counties = set()
    seen = set()
    for station in stations:
        if station["id"] in seen:
            raise ValueError("Duplicate AFDC station ID")
        seen.add(station["id"])
        if station.get("county_fips") not in county_populations:
            continue
        if (
            station.get("fuel_type_code"),
            station.get("access_code"),
            station.get("status_code"),
        ) != ("ELEC", "public", "E"):
            continue
        count = station.get("ev_dc_fast_num")
        if count is None:
            raise ValueError("Missing DC port count; incomplete charging feature")
        if isinstance(count, bool) or int(count) != count or count < 0:
            raise ValueError("Invalid DC port count")
        ports += count
        if count:
            counties.add(station["county_fips"])
    return {
        "public_dc_ports_per_100k": ports / metro_population * 100000,
        "population_share_in_counties_with_dc": sum(
            county_populations[c] for c in counties
        )
        / metro_population,
    }
