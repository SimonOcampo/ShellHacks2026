from pathlib import Path
from types import SimpleNamespace

import pytest

from contracts.models import DataRelease
from odd_scout.store import load_release


ROOT = Path(__file__).resolve().parents[2]
MOCK_RELEASE = ROOT / "data/releases/mock.v1.json"


def test_verified_mode_does_not_fall_back_to_mock_release(monkeypatch):
    monkeypatch.setenv("ODD_DATA_MODE", "verified")
    monkeypatch.setenv("ODD_DATA_RELEASE", str(MOCK_RELEASE))

    with pytest.raises(ValueError, match="no implicit mock fallback"):
        load_release()


@pytest.mark.parametrize(
    ("ranked_count", "rejects"),
    [(7, True), (8, False)],
)
def test_verified_startup_requires_eight_complete_candidates(
    monkeypatch, ranked_count, rejects
):
    monkeypatch.setenv("ODD_DATA_MODE", "verified")
    monkeypatch.setenv("ODD_DATA_RELEASE", str(MOCK_RELEASE))
    verified_release = SimpleNamespace(
        versions=SimpleNamespace(data_mode="verified")
    )

    # Stub validation and ranking so this gate test does not invent verified measurements.
    monkeypatch.setattr(
        DataRelease,
        "model_validate_json",
        classmethod(lambda cls, _: verified_release),
    )
    monkeypatch.setattr(
        "odd_ranking.engine.rank",
        lambda release, request: SimpleNamespace(ranked=[None] * ranked_count),
    )

    if rejects:
        with pytest.raises(ValueError, match="at least eight complete candidates"):
            load_release()
    else:
        assert load_release() is verified_release
