import pytest
from adapters.sources import acs_features, noaa_features, charging_features


def test_acs_denominators_and_bins():
    row = {
        "B01003_001E": 1000,
        "B08201_001E": 400,
        "B08201_002E": 40,
        "B08301_001E": 500,
        "B08301_010E": 50,
        "B08303_001E": 120,
    }
    row.update({f"B08303_{i:03d}E": 10 for i in range(2, 14)})
    result = acs_features(row, 10)
    assert result["zero_vehicle_household_share"] == 0.1
    assert result["population_density_per_km2"] == 100
    row["B08303_002E"] = -666666666
    with pytest.raises(ValueError):
        acs_features(row, 10)


def test_weather_missing_not_zero():
    station = {
        "station_id": "A",
        "latitude": 25.7,
        "longitude": -80.2,
        "annual_precipitation_mm": 1000,
        "annual_snowfall_mm": None,
        "hot_days_32c": 90,
    }
    with pytest.raises(ValueError):
        noaa_features([station], 25.7, -80.2)
    station["annual_snowfall_mm"] = 0
    values, selected = noaa_features([station], 25.7, -80.2)
    assert values["annual_snowfall_mm"] == 0 and selected[0]["station_id"] == "A"


def test_charging_filter_and_missing():
    station = {
        "id": 1,
        "county_fips": "12086",
        "fuel_type_code": "ELEC",
        "access_code": "public",
        "status_code": "E",
        "ev_dc_fast_num": 5,
    }
    values = charging_features([station], {"12086": 100000}, 100000)
    assert values["public_dc_ports_per_100k"] == 5
    assert values["population_share_in_counties_with_dc"] == 1
    station["ev_dc_fast_num"] = None
    with pytest.raises(ValueError):
        charging_features([station], {"12086": 100000}, 100000)
