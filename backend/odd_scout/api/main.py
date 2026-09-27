import os
from contextlib import asynccontextmanager
from threading import BoundedSemaphore

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
    ReferenceRankingRequest,
    SimulationRequest,
    SimulationResult,
)
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from odd_ranking.engine import rank, rank_reference_cities
from starlette.exceptions import HTTPException as StarletteHTTPException

from odd_scout.api.limits import RequestSizeLimit
from odd_scout.explanations.live import LiveExplanation
from odd_scout.explanations.template import explain
from odd_scout.simulation.engine import CapacityError, simulate
from odd_scout.simulation.profile import load_rism_profile
from odd_scout.store import (
    assumptions,
    default_weights,
    load_release,
    load_waymo_reference_ranking,
    load_waymo_reference_release,
)


@asynccontextmanager
async def lifespan(app):
    app.state.release = load_release()
    app.state.waymo_reference_release = load_waymo_reference_release()
    app.state.waymo_reference_ranking = load_waymo_reference_ranking()
    app.state.live_explanations = LiveExplanation()
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


@app.post("/api/v1/reference-rankings", response_model=RankingResult)
def reference_rankings(request: ReferenceRankingRequest):
    try:
        if "weights" not in request.model_fields_set:
            request = request.model_copy(
                update={"weights": PillarWeights(**default_weights())}
            )
        return rank_reference_cities(app.state.release, request, request.city_ids)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/v1/waymo-reference-rankings", response_model=RankingResult)
def waymo_reference_rankings(request: ReferenceRankingRequest):
    try:
        if "weights" not in request.model_fields_set:
            request = request.model_copy(
                update={"weights": PillarWeights(**default_weights())}
            )
        return rank_reference_cities(
            app.state.waymo_reference_release, request, request.city_ids
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post(
    "/api/v1/waymo-reference-cities/{city_id}/explanation",
    response_model=Explanation,
)
def waymo_reference_explanation(
    city_id: str, request: ReferenceRankingRequest, http_request: Request
):
    release = app.state.waymo_reference_release
    if city_id not in {city.city_id for city in release.cities}:
        raise HTTPException(404, "Unknown reference market ID")
    try:
        if "weights" not in request.model_fields_set:
            request = request.model_copy(
                update={"weights": PillarWeights(**default_weights())}
            )
        ranking = rank_reference_cities(release, request, request.city_ids)
        template = explain(release, ranking, city_id)
        return app.state.live_explanations.explain(
            release,
            ranking,
            city_id,
            template,
            http_request.client.host if http_request.client else "unknown",
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/v1/cities/{city_id}/explanation", response_model=Explanation)
def explanation(city_id: str, request: RankingRequest, http_request: Request):
    get_city(city_id)
    try:
        ranking = calculate_ranking(request)
        template = explain(app.state.release, ranking, city_id)
        return app.state.live_explanations.explain(
            app.state.release,
            ranking,
            city_id,
            template,
            http_request.client.host if http_request.client else "unknown",
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/v1/simulations", response_model=SimulationResult)
def simulation(request: SimulationRequest):
    get_city(request.city_id)
    demand_profile = None
    simulation_assumptions = assumptions(request.fleet_size)
    if request.demand_profile_id == "providence-rism-2015.v1":
        if request.city_id != "cbsa:39300":
            raise HTTPException(422, "Providence demand profile requires cbsa:39300")
        try:
            demand_profile = load_rism_profile()
        except (OSError, ValueError) as exc:
            raise HTTPException(
                503, "Providence demand profile is unavailable"
            ) from exc
        simulation_assumptions = simulation_assumptions.model_copy(
            update={"profile_id": demand_profile.source.profile_id}
        )
    if not slots.acquire(blocking=False):
        raise HTTPException(429, "Simulation capacity busy; retry shortly")
    try:
        return simulate(
            request,
            simulation_assumptions,
            app.state.release.versions,
            demand_profile=demand_profile,
        )
    except CapacityError as exc:
        raise HTTPException(413, str(exc)) from exc
    finally:
        slots.release()


@app.post("/api/v1/waymo-reference-simulations", response_model=SimulationResult)
def waymo_reference_simulation(request: SimulationRequest):
    if request.demand_profile_id != "synthetic-zone.v1":
        raise HTTPException(
            422, "Waymo reference scenarios use the synthetic demand profile"
        )
    release = app.state.waymo_reference_release
    if request.city_id not in {
        reference.city_id
        for reference in release.references
        if reference.enabled and reference.operator == "Waymo"
    }:
        raise HTTPException(404, "Unknown Waymo reference market ID")
    if not slots.acquire(blocking=False):
        raise HTTPException(429, "Simulation capacity busy; retry shortly")
    try:
        return simulate(request, assumptions(request.fleet_size), release.versions)
    except CapacityError as exc:
        raise HTTPException(413, str(exc)) from exc
    finally:
        slots.release()
