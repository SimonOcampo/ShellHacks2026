import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from contracts.models import (
    DataRelease,
    Measurement,
    PillarWeights,
    SimulationRequest,
    SimulationAssumptions,
    SimulationResult,
    RankingResult,
    Explanation,
    CityFeature,
    CityList,
    PublicConfig,
)
from odd_scout.api.main import app, slots


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("ODD_DATA_MODE", "mock")
    monkeypatch.delenv("ODD_DATA_RELEASE", raising=False)
    with TestClient(app) as c:
        yield c


def test_integrated_flow(client):
    assert client.get("/health").json()["versions"]["data_mode"] == "mock"
    cities = client.get("/api/v1/cities").json()["cities"]
    assert len(cities) == 20
    ranking = client.post("/api/v1/rankings", json={}).json()
    city_id = ranking["ranked"][0]["city_id"]
    assert client.get(f"/api/v1/cities/{city_id}").status_code == 200
    explanation = client.post(f"/api/v1/cities/{city_id}/explanation", json={}).json()
    assert explanation["ranking_id"] == ranking["ranking_id"]
    response = client.post("/api/v1/simulations", json={"city_id": city_id, "days": 1})
    assert response.status_code == 200
    assert response.json()["metrics"]["rides_completed"] > 0


def test_category_selection_and_weight_comparison(client):
    response = client.post(
        "/api/v1/rankings",
        json={
            "reference_categories": ["commercial"],
            "weights": {"familiarity": 0.1, "readiness": 0.6, "opportunity": 0.3},
            "compare_weights": {"familiarity": 0.4, "readiness": 0.2, "opportunity": 0.4},
        },
    )
    assert response.status_code == 200
    result = response.json()
    baseline = client.post("/api/v1/rankings", json={}).json()
    assert result["reference_ids"] == baseline["reference_ids"]
    assert result["weight_sensitivity"]["baseline_ranking_id"] == baseline["ranking_id"]
    assert len(result["weight_sensitivity"]["changes"]) == len(result["ranked"])
    assert client.post(
        "/api/v1/rankings", json={"reference_categories": ["testing"]}
    ).status_code == 422


def test_error_shapes(client):
    assert client.get("/api/v1/cities/unknown").status_code == 404
    for body in [
        {"city_id": "cbsa:33100", "fleet_size": 0},
        {"city_id": "cbsa:33100", "base_fare_usd": 0.001},
        {"city_id": "unknown"},
    ]:
        response = client.post("/api/v1/simulations", json=body)
        assert response.status_code in (404, 422)
        assert set(response.json()) == {"error"}
    assert (
        client.post(
            "/api/v1/rankings",
            json={"weights": {"familiarity": 0, "readiness": 0, "opportunity": 0}},
        ).status_code
        == 422
    )
    oversized = client.post(
        "/api/v1/simulations",
        content="x" * 16385,
        headers={"Content-Type": "application/json"},
    )
    assert (
        oversized.status_code == 413
        and oversized.json()["error"]["code"] == "too_large"
    )
    slots.acquire()
    slots.acquire()
    try:
        assert (
            client.post(
                "/api/v1/simulations", json={"city_id": "cbsa:33100"}
            ).status_code
            == 429
        )
    finally:
        slots.release()
        slots.release()


def test_trust_boundaries(release, settings):
    with pytest.raises(ValidationError):
        PillarWeights(familiarity=float("inf"))
    with pytest.raises(ValidationError):
        SimulationRequest(city_id="x", fleet_size=1.2)
    with pytest.raises(ValidationError):
        Measurement(
            value=None,
            unit="x",
            quality="missing",
            missing_reason=None,
            provenance_ids=[],
        )
    values = settings.model_dump()
    values["hourly_demand_weights"] = [0] * 24
    with pytest.raises(ValidationError):
        SimulationAssumptions(**values)
    payload = release.model_dump()
    payload["cities"][0]["features"]["population"]["unit"] = "wrong"
    with pytest.raises(ValidationError):
        DataRelease(**payload)
    payload = release.model_dump()
    payload["versions"]["data_mode"] = "verified"
    for city in payload["cities"]:
        city["versions"]["data_mode"] = "verified"
    with pytest.raises(ValidationError):
        DataRelease(**payload)


def test_openapi_no_drift():
    stored = json.loads(Path("packages/contracts/openapi.json").read_text())
    assert stored == app.openapi()


def test_committed_fixtures_validate():
    models = {
        "cities": CityList,
        "config": PublicConfig,
        "ranking": RankingResult,
        "city": CityFeature,
        "explanation": Explanation,
        "simulation": SimulationResult,
    }
    for path in Path("packages/contracts/fixtures").glob("*.json"):
        model = models[path.stem.split("-")[0]]
        model.model_validate_json(path.read_text(encoding="utf-8"))
        assert (
            path.read_bytes()
            == (Path("apps/web/public/fixtures") / path.name).read_bytes()
        )


def test_cors_local_origins_only(client):
    for origin in ["http://localhost:3000", "http://127.0.0.1:3000"]:
        response = client.options(
            "/api/v1/simulations",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type",
            },
        )
        assert response.headers["access-control-allow-origin"] == origin
    response = client.options(
        "/api/v1/simulations",
        headers={
            "Origin": "https://untrusted.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert "access-control-allow-origin" not in response.headers
