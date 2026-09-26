from src.datasets.noaa.process import missing_climate_features
from src.datasets.noaa.download import HOT_DAY_DATATYPE, _published_normal
from src.datasets.noaa.process import aggregate_hot_day_stations

def test_hot_days_is_missing_when_daily_threshold_not_available():
    value=missing_climate_features()["hot_days_32c"]
    assert value["value"] is None
    assert "not retrieved" in value["missing_reason"]

def test_hot_day_threshold_is_the_noaa_exact_90f_metric():
    assert HOT_DAY_DATATYPE == "ANN-TMAX-AVGNDS-GRTH090"

def test_hot_day_missing_stations_do_not_become_zero():
    assert aggregate_hot_day_stations([]) is None
    assert aggregate_hot_day_stations([{"value": 12.0}, {"value": None}]) == 12.0

def test_hot_day_average_uses_available_station_counts():
    assert aggregate_hot_day_stations([{"value": 10.0}, {"value": 20.0}, {"value": 30.0}]) == 20.0


def test_noaa_published_normal_checks_flags_and_missing_sentinels():
    key = "ANN-SNOW-NORMAL"
    row = {key: "0.0", f"meas_flag_{key}": " ", f"comp_flag_{key}": "S"}
    assert _published_normal(row, key) == 0.0
    assert _published_normal({**row, f"comp_flag_{key}": "P"}, key) == 0.0
    assert _published_normal({**row, f"meas_flag_{key}": "M"}, key) is None
    assert _published_normal({**row, f"comp_flag_{key}": " "}, key) is None
    assert _published_normal({**row, key: "-9999"}, key) is None
