import os
import logging
from contextlib import asynccontextmanager
from threading import BoundedSemaphore

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from contracts.models import (
    CityFeature,
    CityList,
    CitySummary,
    AnalystChatRequest,
    AnalystChatResponse,
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
from odd_scout.explanations.gemini import allow_request, answer_with_gemini
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
logger = logging.getLogger(__name__)


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


@app.post("/api/v1/cities/{city_id}/chat", response_model=AnalystChatResponse)
async def analyst_chat(city_id: str, request: AnalystChatRequest, http_request: Request):
    city = get_city(city_id)
    client_id = http_request.client.host if http_request.client else "unknown"
    if not allow_request(client_id):
        raise HTTPException(429, "Analyst request limit reached; retry in one minute")
    try:
        ranking = calculate_ranking(request.ranking)
        score = next(
            (item for item in ranking.ranked + ranking.unranked if item.city_id == city_id),
            None,
        )
        if score is None:
            raise HTTPException(422, "City is not part of the current candidate ranking")
        explanation_result = explain(app.state.release, ranking, city_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    evidence_ids = set(explanation_result.evidence_ids)
    context = {
        "city": {
            "city_id": city.city_id,
            "name": city.display_name,
            "geography": city.geography_type,
            "geography_vintage": city.geography_vintage,
            "state_codes": city.state_codes,
            "versions": city.versions.model_dump(),
            "features": {
                key: value.model_dump() for key, value in city.features.items()
            },
            "legal_evidence": [item.model_dump() for item in city.legal_evidence],
            "sources": [
                item.model_dump()
                for item in city.provenance
                if item.id in evidence_ids
            ],
        },
        "ranking": {
            "ranking_id": ranking.ranking_id,
            "weights": ranking.normalized_weights.model_dump(),
            "mode": ranking.versions.data_mode,
            "score": score.model_dump(),
            "explanation": explanation_result.model_dump(),
        },
        "conversation": [item.model_dump() for item in request.history[-8:]],
        "question": request.question,
    }
    generated, fallback_reason = await answer_with_gemini(context, evidence_ids)
    if generated is not None:
        return generated

    logger.warning(
        "Gemini analyst fallback: city_id=%s api_key_present=%s model=%s reason=%s",
        city_id,
        bool(os.getenv("GEMINI_API_KEY", "").strip()),
        os.getenv("GEMINI_MODEL", "gemini-3.6-flash"),
        fallback_reason or "unspecified provider failure",
    )

    summary = explanation_result.summary
    details = explanation_result.advantages[:3]
    limitations = explanation_result.tradeoffs[:2]
    answer = "Gemini is unavailable, so this is the structured evidence fallback. " + summary
    if details:
        answer += " Evidence highlights: " + " ".join(details)
    if limitations:
        answer += " Limitations: " + " ".join(limitations)
    return AnalystChatResponse(
        mode="template", answer=answer, evidence_ids=explanation_result.evidence_ids
    )


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
