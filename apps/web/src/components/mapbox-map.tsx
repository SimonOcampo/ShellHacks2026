"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Map, Maximize2, RotateCcw } from "lucide-react";
import type { CityList, Ranking } from "@/lib/api/types";
import MarketMap from "./market-map";

type City = CityList["cities"][number];
type MapInstance = {
  on: (
    event: string,
    handler: (event?: { error?: { message?: string } }) => void,
  ) => void;
  once: (event: string, handler: () => void) => void;
  addSource: (id: string, source: Record<string, unknown>) => void;
  addLayer: (layer: Record<string, unknown>) => void;
  getSource: (id: string) => { setData: (data: unknown) => void } | undefined;
  getLayer: (id: string) => unknown;
  addControl: (control: unknown, position?: string) => void;
  easeTo: (options: {
    center?: [number, number];
    zoom?: number;
    duration?: number;
  }) => void;
  remove: () => void;
};
type Marker = {
  setLngLat: (point: [number, number]) => Marker;
  setRotation: (rotation: number) => Marker;
  addTo: (map: MapInstance) => Marker;
  remove: () => void;
};
type MapboxApi = {
  Map: new (options: Record<string, unknown>) => MapInstance;
  Marker: new (options?: Record<string, unknown>) => Marker;
  AttributionControl: new (options?: { compact?: boolean }) => unknown;
};
declare global {
  interface Window {
    mapboxgl?: MapboxApi;
  }
}

const mapboxVersion = "v3.30.0";
let mapboxLoad: Promise<MapboxApi> | undefined;

function loadMapbox() {
  if (window.mapboxgl) return Promise.resolve(window.mapboxgl);
  if (mapboxLoad) return mapboxLoad;
  mapboxLoad = new Promise<MapboxApi>((resolve, reject) => {
    const cssHref = `https://api.mapbox.com/mapbox-gl-js/${mapboxVersion}/mapbox-gl.css`;
    if (!document.querySelector(`link[href="${cssHref}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = cssHref;
      document.head.append(link);
    }
    const script = document.createElement("script");
    script.src = `https://api.mapbox.com/mapbox-gl-js/${mapboxVersion}/mapbox-gl.js`;
    script.async = true;
    script.onload = () =>
      window.mapboxgl
        ? resolve(window.mapboxgl)
        : reject(new Error("Mapbox GL JS did not initialize."));
    script.onerror = () => reject(new Error("Mapbox GL JS could not load."));
    document.head.append(script);
  });
  return mapboxLoad;
}

function markerElement(className: string, label: string, interactive = true) {
  const element = document.createElement(interactive ? "button" : "span");
  if (interactive) (element as HTMLButtonElement).type = "button";
  else element.setAttribute("role", "img");
  element.className = className;
  element.setAttribute("aria-label", label);
  element.title = label;
  element.innerHTML = "<span aria-hidden='true'></span>";
  return element;
}

function MarketFallback({
  cities,
  ranking,
  selected,
  onSelect,
  message,
}: {
  cities: City[];
  ranking: Ranking;
  selected: string;
  onSelect: (id: string) => void;
  message: string;
}) {
  return (
    <div className="mapbox-fallback">
      <div
        className="mapbox-fallback-note"
        role={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ? "alert" : "status"}
      >
        <Map size={14} />
        <span>{message}</span>
        <a href="https://account.mapbox.com/" target="_blank" rel="noreferrer">
          Get a token <ArrowUpRight size={11} />
        </a>
      </div>
      <MarketMap
        cities={cities}
        ranking={ranking}
        selected={selected}
        onSelect={onSelect}
      />
    </div>
  );
}

export function MarketMapbox({
  cities,
  ranking,
  selected,
  focusVersion,
  onSelect,
}: {
  cities: City[];
  ranking: Ranking;
  selected: string;
  focusVersion: number;
  onSelect: (id: string) => void;
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const markers = useRef<Marker[]>([]);
  const previousFocusVersion = useRef(focusVersion);
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    if (!token || !container.current) return;
    let active = true;
    setMapError("");
    loadMapbox()
      .then((mapbox) => {
        if (!active || !container.current) return;
        const map = new mapbox.Map({
          accessToken: token,
          container: container.current,
          style: "mapbox://styles/mapbox/navigation-night-v1",
          center: [-98.5, 39.5],
          zoom: 3.3,
          attributionControl: false,
          logoPosition: "bottom-left",
        });
        map.addControl(
          new mapbox.AttributionControl(
            container.current.clientWidth < 720 ? { compact: true } : undefined,
          ),
          "bottom-right",
        );
        mapRef.current = map;
        map.on("error", (event) => {
          if (event?.error?.message) setMapError(event.error.message);
        });
        map.once("load", () => {
          if (active) setMapReady(true);
        });
      })
      .catch((error: unknown) => {
        if (active)
          setMapError(
            error instanceof Error
              ? error.message
              : "Mapbox map could not load.",
          );
      });
    return () => {
      active = false;
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [token]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.mapboxgl) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = cities.map((city) => {
      const score = [...ranking.ranked, ...ranking.unranked].find(
        (item) => item.city_id === city.city_id,
      );
      const selectedCity = city.city_id === selected;
      const element = markerElement(
        `mapbox-city-marker ${selectedCity ? "is-selected" : ""} ${(score?.rank ?? 99) <= 3 ? "is-top" : ""}`,
        `${city.display_name}, ${score?.rank ? `rank ${score.rank}` : "not ranked"}. Select to focus map.`,
      );
      element.addEventListener("click", () => onSelect(city.city_id));
      return new window.mapboxgl!.Marker({ element, anchor: "center" })
        .setLngLat([city.longitude, city.latitude])
        .addTo(mapRef.current!);
    });
  }, [mapReady, cities, ranking, selected, onSelect]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (focusVersion !== previousFocusVersion.current) {
      const city = cities.find((item) => item.city_id === selected);
      if (city)
        mapRef.current.easeTo({
          center: [city.longitude, city.latitude],
          zoom: 10.8,
          duration: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? 0
            : 1100,
        });
    }
    previousFocusVersion.current = focusVersion;
  }, [mapReady, selected, cities, focusVersion]);

  if (!token || mapError)
    return (
      <MarketFallback
        cities={cities}
        ranking={ranking}
        selected={selected}
        onSelect={onSelect}
        message={
          mapError
            ? `Mapbox unavailable: ${mapError}. Showing local U.S. map.`
            : "Add a public Mapbox token to show street-level city maps. Local U.S. map remains interactive."
        }
      />
    );
  const selectedCity = cities.find((city) => city.city_id === selected);
  return (
    <div className="mapbox-frame">
      <div
        ref={container}
        className="mapbox-canvas"
        role="application"
        aria-label="Interactive Mapbox map of candidate U.S. metros"
      />
      <div className="mapbox-overlay mapbox-city-label">
        <span className="mapbox-live-dot" />
        {selectedCity?.display_name ?? "United States"}
        <small>{selectedCity ? "CITY VIEW" : "CANDIDATE METROS"}</small>
      </div>
      {selectedCity && (
        <button
          className="mapbox-reset"
          type="button"
          onClick={() =>
            mapRef.current?.easeTo({
              center: [-98.5, 39.5],
              zoom: 3.3,
              duration: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? 0
                : 900,
            })
          }
        >
          <RotateCcw size={12} /> U.S. view
        </button>
      )}
      <div className="mapbox-legend">
        <span>
          <i className="is-top" /> Top three
        </span>
        <span>
          <i /> Candidate
        </span>
        <span>
          <Maximize2 size={11} /> Select a city to zoom
        </span>
      </div>
      {!mapReady && (
        <div className="mapbox-loading" role="status">
          Loading Mapbox streets…
        </div>
      )}
    </div>
  );
}

type VehicleState = "idle" | "pickup" | "dropoff";
type VehicleMotion = {
  index: number;
  routeIndex: number;
  state: VehicleState;
  progress: number;
};
type AnimatedVehicle = {
  marker: Marker;
  element: HTMLElement;
  route: StreetRoute;
  state: VehicleState;
  index: number;
};
type Coordinate = [number, number];
type StreetRoute = {
  coordinates: Coordinate[];
  travelPath: Coordinate[];
  cumulativeMeters: number[];
  lengthMeters: number;
};
type DirectionsResponse = {
  code?: string;
  routes?: {
    legs?: {
      steps?: { geometry?: { coordinates?: Coordinate[] } }[];
    }[];
  }[];
};

const maxRenderedVehicles = 60;
const routeCount = 4;
const vehicleCount = (fleetSize: number) =>
  Math.max(0, Math.min(maxRenderedVehicles, Math.floor(fleetSize)));

function seededUnit(seed: number, index: number, salt: number) {
  let value = (seed ^ Math.imul(index + 1, 0x45d9f3b) ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 0x1_0000_0000;
}

function cityWaypoints(longitude: number, latitude: number, seed: number) {
  return Array.from({ length: routeCount + 1 }, (_, index) => {
    const lonRadius = 0.012 / Math.max(Math.cos((latitude * Math.PI) / 180), 0.45);
    const east = (seededUnit(seed, index, 91) - 0.5) * 2 * lonRadius;
    const north = (seededUnit(seed, index, 137) - 0.5) * 0.018;
    return [longitude + east, latitude + north] as Coordinate;
  });
}

function distanceMeters(from: Coordinate, to: Coordinate) {
  const meanLatitude = ((from[1] + to[1]) / 2) * (Math.PI / 180);
  const east = (to[0] - from[0]) * 111_320 * Math.cos(meanLatitude);
  const north = (to[1] - from[1]) * 111_320;
  return Math.hypot(east, north);
}

function createStreetRoute(coordinates: Coordinate[]): StreetRoute {
  const travelPath = [...coordinates, ...coordinates.slice(0, -1).reverse()];
  const cumulativeMeters = [0];
  for (let index = 1; index < travelPath.length; index += 1) {
    cumulativeMeters.push(
      cumulativeMeters[index - 1] +
        distanceMeters(travelPath[index - 1], travelPath[index]),
    );
  }
  return {
    coordinates,
    travelPath,
    cumulativeMeters,
    lengthMeters: cumulativeMeters.at(-1) ?? 0,
  };
}

async function fetchStreetRoutes(
  longitude: number,
  latitude: number,
  seed: number,
  token: string,
  signal: AbortSignal,
) {
  const coordinates = cityWaypoints(longitude, latitude, seed);
  const query = new URLSearchParams({
    access_token: token,
    geometries: "geojson",
    overview: "full",
    steps: "true",
  });
  const path = coordinates.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const response = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${path}?${query}`,
    { signal },
  );
  if (!response.ok) throw new Error(`Directions API returned ${response.status}`);
  const payload = (await response.json()) as DirectionsResponse;
  if (payload.code !== "Ok" || !payload.routes?.[0]?.legs)
    throw new Error(`Directions API returned ${payload.code ?? "no routes"}`);

  return payload.routes[0].legs.flatMap((leg) => {
    const path: Coordinate[] = [];
    for (const step of leg.steps ?? []) {
      for (const coordinate of step.geometry?.coordinates ?? []) {
        const previous = path.at(-1);
        if (!previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1])
          path.push(coordinate);
      }
    }
    return path.length >= 2 ? [createStreetRoute(path)] : [];
  });
}

function vehicleMotion(
  index: number,
  count: number,
  seed: number,
  seconds: number,
): VehicleMotion {
  const phase = ((index / Math.max(count, 1)) * 24 + seededUnit(seed, index, 17) * 2) % 24;
  const cycle = (seconds + phase) % 24;
  const base = { index, routeIndex: index % routeCount };
  if (cycle < 3) return { ...base, state: "idle", progress: 0.06 };
  if (cycle < 12)
    return {
      ...base,
      state: "pickup",
      progress: 0.06 + ((cycle - 3) / 9) * 0.46,
    };
  if (cycle < 21)
    return {
      ...base,
      state: "dropoff",
      progress: 0.52 + ((cycle - 12) / 9) * 0.42,
    };
  return { ...base, state: "idle", progress: 0.94 };
}

function routePosition(route: StreetRoute, progress: number) {
  const distance = Math.max(0, Math.min(0.9999, progress)) * route.lengthMeters;
  let low = 0;
  let high = route.cumulativeMeters.length - 1;
  while (low < high - 1) {
    const middle = Math.floor((low + high) / 2);
    if (route.cumulativeMeters[middle] <= distance) low = middle;
    else high = middle;
  }
  const segmentLength = route.cumulativeMeters[high] - route.cumulativeMeters[low];
  const fraction = segmentLength
    ? (distance - route.cumulativeMeters[low]) / segmentLength
    : 0;
  const from = route.travelPath[low];
  const to = route.travelPath[high];
  const meanLatitude = ((from[1] + to[1]) / 2) * (Math.PI / 180);
  return [
    [from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction] as Coordinate,
    (Math.atan2((to[0] - from[0]) * Math.cos(meanLatitude), to[1] - from[1]) * 180) /
      Math.PI,
  ] as const;
}

function FallbackSimulationMap({
  cityName,
  message,
}: {
  cityName: string;
  message: string;
}) {
  return (
    <div className="mapbox-frame sim-map-frame">
      <div
        className="fallback-street-map"
        role="img"
        aria-label={`Illustrative street grid for ${cityName}; no vehicle paths are shown without road routing.`}
      >
        <svg
          viewBox="0 0 1000 560"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="city-blocks"
              width="112"
              height="90"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M0 0H112V90H0Z"
                fill="#10252a"
                stroke="#294449"
                strokeWidth="1"
              />
              <path d="M12 12H100V78H12Z" fill="#173238" opacity=".78" />
            </pattern>
          </defs>
          <rect width="1000" height="560" fill="url(#city-blocks)" />
          <path
            d="M-40 400 C180 340 300 455 510 370 S820 320 1040 225"
            fill="none"
            stroke="#1a4148"
            strokeWidth="34"
          />
          <path
            d="M195 -20 C255 140 220 290 390 580 M690 -20 C610 150 790 315 740 580"
            fill="none"
            stroke="#294e53"
            strokeWidth="17"
          />
          <path
            d="M195 -20 C255 140 220 290 390 580 M690 -20 C610 150 790 315 740 580"
            fill="none"
            stroke="#7ba3a5"
            strokeOpacity=".45"
            strokeWidth="1"
            strokeDasharray="5 8"
          />
        </svg>
      </div>
      <div className="mapbox-overlay mapbox-city-label">
        <span className="mapbox-live-dot" />
        {cityName}
        <small>ILLUSTRATIVE ZONE</small>
      </div>
      <div
        className="sim-map-setup-note"
        role={message.startsWith("Mapbox unavailable") ? "alert" : "status"}
      >
        {message}
      </div>
      <div className="mapbox-disclaimer">
        Cars stay hidden until real road routes are available. API returns hourly
        aggregates, not per-vehicle paths.
      </div>
    </div>
  );
}

export function SimulationMapbox({
  cityName,
  latitude,
  longitude,
  activeHour,
  playing,
  reducedMotion,
  simulationActive,
  fleetSize,
  seed,
}: {
  cityName: string;
  latitude: number;
  longitude: number;
  activeHour: number;
  playing: boolean;
  reducedMotion: boolean;
  simulationActive: boolean;
  fleetSize: number;
  seed: number;
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const vehicleMarkers = useRef<AnimatedVehicle[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [streetRoutes, setStreetRoutes] = useState<StreetRoute[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  useEffect(() => {
    if (!token || !container.current) return;
    let active = true;
    setMapError("");
    loadMapbox()
      .then((mapbox) => {
        if (!active || !container.current) return;
        const map = new mapbox.Map({
          accessToken: token,
          container: container.current,
          style: "mapbox://styles/mapbox/navigation-night-v1",
          center: [longitude, latitude],
          zoom: 12.2,
          attributionControl: false,
          logoPosition: "bottom-left",
        });
        map.addControl(
          new mapbox.AttributionControl(
            container.current.clientWidth < 720 ? { compact: true } : undefined,
          ),
          "bottom-right",
        );
        mapRef.current = map;
        map.on("error", (event) => {
          if (event?.error?.message) setMapError(event.error.message);
        });
        map.once("load", () => {
          if (active) setMapReady(true);
        });
      })
      .catch((error: unknown) => {
        if (active)
          setMapError(
            error instanceof Error
              ? error.message
              : "Mapbox map could not load.",
          );
      });
    return () => {
      active = false;
      vehicleMarkers.current.forEach(({ marker }) => marker.remove());
      vehicleMarkers.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [token, longitude, latitude]);

  useEffect(() => {
    if (!token || !simulationActive) {
      setStreetRoutes([]);
      setRouteError("");
      setRouteLoading(false);
      return;
    }
    const controller = new AbortController();
    setStreetRoutes([]);
    setRouteError("");
    setRouteLoading(true);
    fetchStreetRoutes(longitude, latitude, seed, token, controller.signal)
      .then((routes) => {
        if (controller.signal.aborted) return;
        if (routes.length === 0) {
          setRouteError("No drivable street routes found near this city center.");
          return;
        }
        setStreetRoutes(routes);
        if (routes.length < routeCount)
          setRouteError(`Only ${routes.length} of ${routeCount} street paths could be routed.`);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setRouteError(
            error instanceof Error
              ? `${error.message}. Check token permissions for Mapbox Directions.`
              : "Mapbox Directions could not return street routes.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setRouteLoading(false);
      });
    return () => controller.abort();
  }, [token, longitude, latitude, seed, simulationActive]);

  useEffect(() => {
    const map = mapRef.current;
    const mapbox = window.mapboxgl;
    if (!mapReady || !map || !mapbox) return;
    const routes = simulationActive ? streetRoutes : [];
    const feature: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: "FeatureCollection",
      features: routes.map((route, index) => ({
        type: "Feature",
        properties: { route: index + 1 },
        geometry: { type: "LineString", coordinates: route.coordinates },
      })),
    };
    try {
      const source = map.getSource("odd-scout-illustrative-route");
      if (source) source.setData(feature);
      else
        map.addSource("odd-scout-illustrative-route", {
          type: "geojson",
          data: feature,
        });
      if (!map.getLayer("odd-scout-route-halo"))
        map.addLayer({
          id: "odd-scout-route-halo",
          type: "line",
          source: "odd-scout-illustrative-route",
          paint: {
            "line-color": "#4fdacf",
            "line-width": 10,
            "line-opacity": 0.17,
            "line-blur": 2,
          },
        });
      if (!map.getLayer("odd-scout-route"))
        map.addLayer({
          id: "odd-scout-route",
          type: "line",
          source: "odd-scout-illustrative-route",
          paint: {
            "line-color": "#73ede2",
            "line-width": 3,
            "line-opacity": 0.94,
          },
        });
    } catch {
      // The map instance can be re-created after token or style changes.
    }
    vehicleMarkers.current.forEach(({ marker }) => marker.remove());
    vehicleMarkers.current = [];
    if (!simulationActive || routes.length === 0) return;
    const count = vehicleCount(fleetSize);
    vehicleMarkers.current = Array.from({ length: count }, (_, index) => {
      const motion = vehicleMotion(index, count, seed, 0);
      const route = routes[motion.routeIndex % routes.length];
      const [point, bearing] = routePosition(route, motion.progress);
      const element = markerElement(
        `mapbox-vehicle-marker ${motion.state}`,
        `Illustrative vehicle ${index + 1}, ${motion.state}`,
        false,
      );
      element.dataset.state = motion.state;
      element.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 32"><path class="car-body" d="M7 2h10l4 7v14l-4 7H7l-4-7V9z"/><path class="car-window" d="M7 9h10l2 5H5zM5 17h14l-2 6H7z"/></svg>`;
      const marker = new mapbox.Marker({
        element,
        anchor: "center",
        rotationAlignment: "map",
      })
        .setLngLat(point)
        .setRotation(bearing)
        .addTo(map);
      return { marker, element, route, state: motion.state, index };
    });
  }, [mapReady, streetRoutes, simulationActive, fleetSize, seed]);

  useEffect(() => {
    if (
      !mapReady ||
      !simulationActive ||
      reducedMotion ||
      vehicleMarkers.current.length === 0
    )
      return;
    const count = vehicleMarkers.current.length;
    const startedAt = performance.now();
    const interval = window.setInterval(() => {
      const seconds = (performance.now() - startedAt) / 1000;
      vehicleMarkers.current.forEach((vehicle) => {
        const motion = vehicleMotion(vehicle.index, count, seed, seconds);
        if (motion.state !== vehicle.state) {
          vehicle.state = motion.state;
          vehicle.element.className = `mapbox-vehicle-marker ${motion.state}`;
          vehicle.element.dataset.state = motion.state;
          vehicle.element.setAttribute(
            "aria-label",
            `Illustrative vehicle ${vehicle.index + 1}, ${motion.state}`,
          );
          vehicle.element.title = `Vehicle ${vehicle.index + 1} · ${motion.state}`;
        }
        const [point, bearing] = routePosition(vehicle.route, motion.progress);
        vehicle.marker.setLngLat(point).setRotation(bearing);
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [mapReady, simulationActive, reducedMotion, seed, fleetSize]);

  if (!token || mapError)
    return (
      <FallbackSimulationMap
        cityName={cityName}
        message={
          mapError
            ? `Mapbox unavailable: ${mapError}. No fabricated vehicle paths are shown.`
            : "Add a Mapbox token with Directions access to show vehicles on real streets."
        }
      />
    );
  return (
    <div className="mapbox-frame sim-map-frame">
      <div
        ref={container}
        className="mapbox-canvas"
        role="application"
        aria-label={`Illustrative Mapbox fleet map for ${cityName}`}
      />
      <div className="mapbox-overlay mapbox-city-label">
        <span className="mapbox-live-dot" />
        {cityName}
        <small>ILLUSTRATIVE ZONE</small>
      </div>
      <div className="mapbox-legend sim-legend">
        <span>
          <i className="vehicle-dot idle" /> Idle
        </span>
        <span>
          <i className="vehicle-dot pickup" /> Picking up
        </span>
        <span>
          <i className="vehicle-dot dropoff" /> Dropping off
        </span>
        <span className="route-key">Mapbox road routes</span>
      </div>
      {simulationActive && !routeLoading && streetRoutes.length > 0 && (
        <span className="mapbox-fleet-count">
          {vehicleCount(fleetSize)} cars · {streetRoutes.length} street paths
        </span>
      )}
      <div className="mapbox-disclaimer">
        Illustrative cars follow Mapbox road geometry; API returns hourly
        aggregates, not vehicle trips
      </div>
      {simulationActive && (routeLoading || routeError) && (
        <span className="sim-map-setup-note" role={routeError ? "alert" : "status"}>
          {routeLoading ? "Finding drivable street routes…" : routeError}
        </span>
      )}
      {simulationActive && !reducedMotion && (
        <span className="mapbox-sim-playing">
          <span className="mapbox-live-dot" />
          {playing ? `FLEET PREVIEW · PLAYING HOUR ${activeHour + 1}` : "FLEET PREVIEW · MOVING"}
        </span>
      )}
      {!mapReady && (
        <div className="mapbox-loading" role="status">
          Loading Mapbox city map…
        </div>
      )}
    </div>
  );
}
