import os
from contextlib import asynccontextmanager
from threading import BoundedSemaphore

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from contracts.models import (
    CityFeature,
    CityList,
    CitySummary,
    ErrorResponse,
    Explanation,
    Health,
    PillarWeights,
    PublicConfig,
    RankingRequest,
    RankingResult,
    SimulationRequest,
    SimulationResult,
)
from odd_ranking.engine import rank
from odd_scout.store import load_release, assumptions, default_weights
from odd_scout.simulation.engine import simulate, CapacityError
from odd_scout.explanations.template import explain
from odd_scout.api.limits import RequestSizeLimit


@asynccontextmanager
async def lifespan(app):
    app.state.release = load_release()
    yield


ERRORS = {status: {"model": ErrorResponse} for status in (404, 413, 422, 429, 503)}
app = FastAPI(title="ODD Scout", version="1.0.0", lifespan=lifespan, responses=ERRORS)
app.add_middleware(RequestSizeLimit)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "ODD_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
        ).split(",")
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
slots = BoundedSemaphore(2)


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "invalid_request",
                "message": "Request validation failed",
                "details": [
                    f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors()
                ],
            }
        },
    )


@app.exception_handler(StarletteHTTPException)
async def http_error(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": {
                    404: "not_found",
                    413: "too_large",
                    422: "invalid_request",
                    429: "busy",
                    503: "unavailable",
                }.get(exc.status_code, "http_error"),
                "message": str(exc.detail),
                "details": [],
            }
        },
    )


def get_city(city_id):
    city = next((c for c in app.state.release.cities if c.city_id == city_id), None)
    if city is None:
        raise HTTPException(404, "Unknown city ID")
    return city


def calculate_ranking(request):
    try:
        if "weights" not in request.model_fields_set:
            request = request.model_copy(
                update={"weights": PillarWeights(**default_weights())}
            )
        return rank(app.state.release, request)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/health", response_model=Health)
def health():
    return Health(status="ok", versions=app.state.release.versions)


@app.get("/api/v1/config", response_model=PublicConfig)
def config():
    release = app.state.release
    return PublicConfig(
        versions=release.versions,
        weights=PillarWeights(**default_weights()),
        features=release.features,
        bounds=release.bounds,
        references=release.references,
        simulation_defaults=assumptions(),
        exclusions=release.exclusions,
    )


@app.get("/api/v1/cities", response_model=CityList)
def cities():
    release = app.state.release
    return CityList(
        versions=release.versions,
        cities=[
            CitySummary(
                **c.model_dump(
                    include={
                        "city_id",
                        "display_name",
                        "official_name",
                        "latitude",
                        "longitude",
                    }
                )
            )
            for c in release.cities
            if c.city_id in release.candidate_ids
        ],
    )


@app.get("/api/v1/cities/{city_id}", response_model=CityFeature)
def city(city_id: str):
    return get_city(city_id)


@app.post("/api/v1/rankings", response_model=RankingResult)
def rankings(request: RankingRequest):
    return calculate_ranking(request)


@app.post("/api/v1/cities/{city_id}/explanation", response_model=Explanation)
def explanation(city_id: str, request: RankingRequest):
    get_city(city_id)
    try:
        return explain(app.state.release, calculate_ranking(request), city_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/v1/simulations", response_model=SimulationResult)
def simulation(request: SimulationRequest):
    get_city(request.city_id)
    if not slots.acquire(blocking=False):
        raise HTTPException(429, "Simulation capacity busy; retry shortly")
    try:
        return simulate(
            request, assumptions(request.fleet_size), app.state.release.versions
        )
    except CapacityError as exc:
        raise HTTPException(413, str(exc)) from exc
    finally:
        slots.release()
