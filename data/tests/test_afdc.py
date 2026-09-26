import pytest
from src.datasets.afdc.download import download

def test_afdc_requires_real_key(monkeypatch):
    monkeypatch.delenv("NREL_API_KEY",raising=False)
    with pytest.raises(RuntimeError,match="NREL_API_KEY"):
        download()
