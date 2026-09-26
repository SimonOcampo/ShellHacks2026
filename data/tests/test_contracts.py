from datetime import datetime, timezone
import pytest
from pydantic import ValidationError
from src.contracts.models import CityFeature, Measurement, Provenance, VersionStamp

def _record(tmp_path):
    raw = tmp_path / "source.csv"; raw.write_bytes(b"source artifact\n")
    import hashlib
    p = Provenance(id="p1", source_name="test", source_url="https://example.org/source", dataset_id="fixture", period="2024", retrieved_at=datetime.now(timezone.utc).isoformat(), source_geography="CBSA", target_geography="CBSA", transformation="fixture input", assumptions=[], raw_sha256=hashlib.sha256(raw.read_bytes()).hexdigest())
    feature_keys = ["annual_precipitation_mm","annual_snowfall_mm","hot_days_32c","mean_commute_minutes","public_dc_ports_per_100k","population_share_in_counties_with_dc","population","population_density_per_km2","zero_vehicle_household_share","transit_commute_share","road_density_km_per_km2","intersection_density_per_km2","average_aadt","lane_miles_per_km2","freeway_share","arterial_share","local_road_share"]
    features = {key: Measurement(value=None, unit="", quality="missing", missing_reason="not present in validation fixture", provenance_ids=[]) for key in feature_keys}
    features["population"] = Measurement(value=1000, unit="persons", quality="observed", missing_reason=None, provenance_ids=["p1"])
    return CityFeature(versions=VersionStamp(schema_version="1", data_version="test", model_version="test", data_mode="verified"), city_id="12345", display_name="Test, ZZ", official_name="Test CBSA", geography_type="cbsa", geography_vintage="2024", state_codes=["ZZ"], latitude=0, longitude=0, features=features, legal_evidence=[], provenance=[p])

def test_city_round_trip_and_provenance_hash(tmp_path):
    city = _record(tmp_path)
    parsed = CityFeature.model_validate(city.model_dump(mode="json"))
    assert parsed.features["population"].value == 1000
    assert len(parsed.provenance[0].raw_sha256) == 64

def test_missing_never_contains_numeric_zero():
    with pytest.raises(ValidationError):
        Measurement(value=0, unit="", quality="missing", missing_reason="unavailable", provenance_ids=[])

def test_dangling_provenance_rejected(tmp_path):
    city = _record(tmp_path).model_dump(mode="json")
    city["features"]["population"]["provenance_ids"] = ["unknown"]
    with pytest.raises(ValidationError):
        CityFeature.model_validate(city)

def test_fraction_range_enforced(tmp_path):
    city = _record(tmp_path).model_dump(mode="json")
    city["features"]["transit_commute_share"] = {"value":1.2,"unit":"fraction","quality":"derived","missing_reason":None,"provenance_ids":["p1"]}
    with pytest.raises(ValidationError):
        CityFeature.model_validate(city)
