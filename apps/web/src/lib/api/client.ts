import type {
  City,
  CityList,
  Config,
  Ranking,
  RankingRequest,
  Explanation,
  Simulation,
  SimulationRequest,
  AnalystChat,
} from "./types";

export const fixtureMode =
  process.env.NEXT_PUBLIC_DATA_TRANSPORT === "fixtures";
const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

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
    throw new Error(json.error?.message ?? `API error ${response.status}`);
  return json as T;
}

async function fixture<T>(name: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/fixtures/${name}.json`, { signal });
  if (!response.ok)
    throw new Error("Fixture unavailable. Run the fixture export command.");
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
  explain: (id: string, request: RankingRequest, signal?: AbortSignal) =>
    fixtureMode
      ? fixture<Explanation>(`explanation-${id.replace(":", "-")}`, signal)
      : call<Explanation>(`/api/v1/cities/${id}/explanation`, request, signal),
  chat: (
    id: string,
    body: {
      question: string;
      history: { role: "user" | "assistant"; text: string }[];
      ranking: RankingRequest;
    },
    signal?: AbortSignal,
  ) => call<AnalystChat>(`/api/v1/cities/${id}/chat`, body, signal),
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
