import pytest
import json
import pandas as pd
from src.datasets.acs.download import download
from src.datasets.acs.process import process
from src.datasets.acs.summary_file import process as process_summary, inspect_margins

def test_acs_requires_real_key_without_falling_back(monkeypatch):
    monkeypatch.delenv("CENSUS_API_KEY",raising=False)
    with pytest.raises(RuntimeError,match="CENSUS_API_KEY"):
        download(2024)

def test_acs_ratios_use_cbsa_numerators_and_denominators(tmp_path):
    geo="metropolitan statistical area/micropolitan statistical area"
    vars=["NAME","B01003_001E","B08201_001E","B08201_002E","B08301_001E","B08301_010E",geo]
    metro=tmp_path/"metro.json"; metro.write_text(json.dumps([vars,["Example metro",1000,400,40,500,50,"12345"]]),encoding="utf8")
    county=tmp_path/"county.json"; county.write_text(json.dumps([["NAME","B01003_001E","state","county"],["Example county",1000,"01","001"]]),encoding="utf8")
    profile=tmp_path/"profile.json"; profile.write_text(json.dumps([["NAME","DP03_0025E",geo],["Example metro",24.5,"12345"]]),encoding="utf8")
    county_map=pd.DataFrame([{"county_geoid":"01001","cbsa_code":"12345"}])
    result=process(metro,county,profile,county_map)["12345"]
    assert result["population"]==1000
    assert result["zero_vehicle_household_share"]==0.1
    assert result["transit_commute_share"]==0.1
    assert result["mean_commute_minutes"]==24.5

def test_keyless_summary_file_cbsa_geoids_and_county_commute_aggregation(tmp_path):
    rows={
        "b01003":["GEO_ID|B01003_E001", "310M700US12345|1000", "0500000US01001|1000"],
        "b08201":["GEO_ID|B08201_E001|B08201_E002", "310M700US12345|400|40"],
        "b08301":["GEO_ID|B08301_E001|B08301_E010", "310M700US12345|500|50", "0500000US01001|500|50"],
        "b08136":["GEO_ID|B08136_E001", "0500000US01001|12000"],
    }
    paths={}
    for table,lines in rows.items():
        path=tmp_path/f"{table}.dat"; path.write_text("\n".join(lines),encoding="utf-8"); paths[table]=path
    county_map=pd.DataFrame([{"county_geoid":"01001","cbsa_code":"12345"}])
    result=process_summary(paths,county_map)["12345"]
    assert result["population"]==1000
    assert result["zero_vehicle_household_share"]==0.1
    assert result["transit_commute_share"]==0.1
    assert result["mean_commute_minutes"]==24


def test_keyless_summary_margins_handle_controlled_population_total(tmp_path):
    rows = {
        "b01003": "GEO_ID|B01003_E001|B01003_M001\n310M700US12345|1000|-555555555\n",
        "b08201": "GEO_ID|B08201_E001|B08201_M001|B08201_E002|B08201_M002\n310M700US12345|400|20|40|8\n",
        "b08301": "GEO_ID|B08301_E001|B08301_M001|B08301_E010|B08301_M010\n310M700US12345|500|30|50|9\n",
        "b08136": "GEO_ID|B08136_E001|B08136_M001\n310M700US12345|12000|400\n",
    }
    paths = {}
    for table, content in rows.items():
        paths[table] = tmp_path / f"{table}.dat"
        paths[table].write_text(content, encoding="utf-8")
    report = inspect_margins(paths, {"12345"})["12345"]
    assert report["b01003"]["B01003_M001"] == {"status": "controlled_total", "value": None}
    assert report["b08201"]["B08201_M002"]["value"] == 8
    assert report["b08136"]["B08136_M001"]["value"] == 400
