from pathlib import Path
import pytest
from src.config.cities import CANDIDATES, REFERENCES
from src.config.settings import RAW
from src.datasets.census_geography.load import load_layer
from src.datasets.census_geography.process import resolve_markets, build_catalog

@pytest.mark.skipif(not (RAW / "census" / "cbsa_2024.zip").exists(), reason="Census TIGER snapshot not downloaded")
def test_all_markets_resolve_and_multi_state_counties_are_complete():
    cbsa_path = RAW / "census" / "cbsa_2024.zip"
    county_path = RAW / "census" / "county_2024.zip"
    cbsa = load_layer(cbsa_path)
    markets = resolve_markets(cbsa)
    assert len(markets) == len(CANDIDATES) + len(REFERENCES) == 35
    assert all(len(m["cbsa_code"]) == 5 for m in markets.values())
    catalog, county_map = build_catalog(cbsa_path, county_path)
    states = {str(r.GEOID): set(r.state_codes) for _, r in catalog.iterrows()}
    for key in ("kansas_city", "cincinnati", "louisville", "providence"):
        assert len(states[markets[key]["cbsa_code"]]) > 1
    assert county_map.county_geoid.nunique() == len(county_map)

def test_market_counts_are_specified():
    assert len(CANDIDATES) == 20
    assert len(REFERENCES) == 15
