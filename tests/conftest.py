import pytest
from odd_scout.store import load_release, assumptions


@pytest.fixture
def release(monkeypatch):
    monkeypatch.setenv("ODD_DATA_MODE", "mock")
    monkeypatch.delenv("ODD_DATA_RELEASE", raising=False)
    return load_release()


@pytest.fixture
def settings():
    return assumptions()
