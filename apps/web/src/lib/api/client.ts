import type {
  City,
  CityList,
  Config,
  Ranking,
  RankingRequest,
  ReferenceRankingRequest,
  Explanation,
  Simulation,
  SimulationRequest,
  DataRelease,
} from "./types";

export const fixtureMode =
  process.env.NEXT_PUBLIC_DATA_TRANSPORT === "fixtures";
const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function call<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const json = await response.json();
  if (!response.ok)
    throw new ApiError(
      json.error?.message ?? `API error ${response.status}`,
      response.status,
    );
  return json as T;
}

async function fixture<T>(name: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/fixtures/${name}.json`, { signal });
  if (!response.ok)
    throw new Error("Fixture unavailable. Run the fixture export command.");
  return response.json() as Promise<T>;
}

async function publicJson<T>(name: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/${name}.json`, { signal });
  if (!response.ok)
    throw new Error(`${name} is unavailable from this frontend release.`);
  return response.json() as Promise<T>;
}

export const api = {
  cities: (signal?: AbortSignal) =>
    fixtureMode
      ? fixture<CityList>("cities", signal)
      : call<CityList>("/api/v1/cities", undefined, signal),
  config: (signal?: AbortSignal) =>
    fixtureMode
      ? fixture<Config>("config", signal)
      : call<Config>("/api/v1/config", undefined, signal),
  city: (id: string, signal?: AbortSignal) =>
    fixtureMode
      ? fixture<City>(`city-${id.replace(":", "-")}`, signal)
      : call<City>(`/api/v1/cities/${id}`, undefined, signal),
  rank: (request: RankingRequest, signal?: AbortSignal) =>
    fixtureMode
      ? fixture<Ranking>("ranking", signal)
      : call<Ranking>("/api/v1/rankings", request, signal),
  referenceRank: (request: ReferenceRankingRequest, signal?: AbortSignal) =>
    fixtureMode
      ? Promise.reject(new Error("Reference scores require the verified API."))
      : call<Ranking>("/api/v1/reference-rankings", request, signal),
  waymoReferenceRelease: (signal?: AbortSignal) =>
    publicJson<DataRelease>("backendreference", signal),
  waymoReferenceRanking: (signal?: AbortSignal) =>
    publicJson<Ranking>("backendreference-ranking", signal),
  rankWaymoReferences: (
    request: ReferenceRankingRequest,
    signal?: AbortSignal,
  ) => call<Ranking>("/api/v1/waymo-reference-rankings", request, signal),
  explainWaymoReference: async (
    id: string,
    request: ReferenceRankingRequest,
    signal?: AbortSignal,
  ) => {
    if (fixtureMode) {
      const explanations = await publicJson<Record<string, Explanation>>(
        "backendreference-explanations",
        signal,
      );
      const explanation = explanations[id];
      if (!explanation)
        throw new Error("Reference market explanation is unavailable.");
      return explanation;
    }
    return call<Explanation>(
      `/api/v1/waymo-reference-cities/${id}/explanation`,
      request,
      signal,
    );
  },
  simulateWaymoReference: async (
    request: SimulationRequest,
    signal?: AbortSignal,
  ) => {
    if (fixtureMode) {
      const defaults: SimulationRequest = {
        city_id: request.city_id,
        fleet_size: 50,
        days: 7,
        demand_multiplier: 1,
        base_fare_usd: 3,
        price_per_mile_usd: 1.75,
        price_per_minute_usd: 0.3,
        seed: 42,
        demand_profile_id: "synthetic-zone.v1",
        include_playback: false,
      };
      if (
        Object.entries(defaults).some(
          ([key, value]) =>
            (request as Record<string, unknown>)[key] !== undefined &&
            (request as Record<string, unknown>)[key] !== value,
        )
      )
        throw new Error(
          "Fixture replay supports default assumptions only. Use HTTP transport to recalculate.",
        );
      const simulations = await publicJson<Record<string, Simulation>>(
        "backendreference-simulations",
        signal,
      );
      const simulation = simulations[request.city_id];
      if (!simulation)
        throw new Error("Reference market simulation is unavailable.");
      return simulation;
    }
    return call<Simulation>(
      "/api/v1/waymo-reference-simulations",
      request,
      signal,
    );
  },
  explain: (id: string, request: RankingRequest, signal?: AbortSignal) =>
    fixtureMode
      ? fixture<Explanation>(`explanation-${id.replace(":", "-")}`, signal)
      : call<Explanation>(`/api/v1/cities/${id}/explanation`, request, signal),
  simulate: async (request: SimulationRequest, signal?: AbortSignal) => {
    if (!fixtureMode)
      return call<Simulation>("/api/v1/simulations", request, signal);
    const result = await fixture<Simulation>(
      `simulation-${request.city_id.replace(":", "-")}`,
      signal,
    );
    const defaults = {
      fleet_size: 50,
      days: 7,
      demand_multiplier: 1,
      base_fare_usd: 3,
      price_per_mile_usd: 1.75,
      price_per_minute_usd: 0.3,
      seed: 42,
      city_id: request.city_id,
      demand_profile_id: "synthetic-zone.v1",
      include_playback: false,
    };
    if (
      Object.entries(defaults).some(
        ([key, value]) =>
          (request as Record<string, unknown>)[key] !== undefined &&
          (request as Record<string, unknown>)[key] !== value,
      )
    )
      throw new Error(
        "Fixture replay supports default assumptions only. Use HTTP transport to recalculate.",
      );
    return result;
  },
};
