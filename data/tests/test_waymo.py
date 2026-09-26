from pathlib import Path
import pytest
from src.config.cities import REFERENCES
from src.config.settings import RAW
from src.datasets.census_geography.load import load_layer
from src.datasets.census_geography.process import resolve_markets
from src.datasets.waymo.reference_markets import build

@pytest.mark.skipif(not (RAW/"waymo"/"rides.html").exists() or not (RAW/"census"/"cbsa_2024.zip").exists(),reason="Official source snapshots not downloaded")
def test_waymo_reference_records_are_source_verified():
    geos=resolve_markets(load_layer(RAW/"census"/"cbsa_2024.zip"))
    markets,prov=build(geos)
    assert len(markets)==len(REFERENCES)==15
    assert all(m.operator=="Waymo" and m.provenance_ids==[prov.id] for m in markets)
    assert all(m.city_id==geos[key]["cbsa_code"] for m,(key,_) in zip(markets,REFERENCES))
