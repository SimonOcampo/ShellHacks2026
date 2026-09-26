import pytest
from src.datasets.afdc.download import download
from src.datasets.afdc.process import qualifying_sites

def test_afdc_requires_real_key(monkeypatch):
    monkeypatch.delenv("NREL_API_KEY",raising=False)
    with pytest.raises(RuntimeError,match="NREL_API_KEY"):
        download()


def test_public_dc_sites_are_deduplicated_by_station_id():
    site = {"id": 10, "status_code": "E", "access_code": "public",
            "latitude": 30.1, "longitude": -97.1, "ev_dc_fast_num": 3}
    rows = qualifying_sites([site, dict(site), {**site, "id": 11, "access_code": "private"}])
    assert len(rows) == 1
    assert rows[0]["station_id"] == 10
    assert rows[0]["dc_fast_ports"] == 3


def test_conflicting_duplicate_station_id_fails_closed():
    site = {"id": 10, "status_code": "E", "access_code": "public",
            "latitude": 30.1, "longitude": -97.1, "ev_dc_fast_num": 3}
    with pytest.raises(ValueError, match="Conflicting AFDC records"):
        qualifying_sites([site, {**site, "ev_dc_fast_num": 4}])
