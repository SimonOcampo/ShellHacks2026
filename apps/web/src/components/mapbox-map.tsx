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
          style: "mapbox://styles/mapbox/light-v11",
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

function routeCoordinates(
  longitude: number,
  latitude: number,
  routeIndex = 0,
): [number, number][] {
  const routes = [
    [
      [-1, -0.2],
      [-0.75, -0.9],
      [-0.05, -1],
      [0.65, -0.65],
      [1, 0],
      [0.68, 0.72],
      [0.05, 1],
      [-0.72, 0.7],
      [-1, -0.2],
    ],
    [
      [-0.92, 0.45],
      [-0.75, -0.45],
      [-0.15, -0.92],
      [0.55, -0.8],
      [0.92, -0.1],
      [0.55, 0.68],
      [-0.12, 0.95],
      [-0.72, 0.82],
      [-0.92, 0.45],
    ],
    [
      [-0.7, -0.78],
      [0.02, -0.96],
      [0.75, -0.52],
      [0.92, 0.3],
      [0.44, 0.92],
      [-0.32, 0.88],
      [-0.92, 0.24],
      [-0.7, -0.78],
    ],
    [
      [-0.98, -0.08],
      [-0.45, -0.72],
      [0.36, -0.94],
      [0.96, -0.36],
      [0.82, 0.48],
      [0.15, 0.96],
      [-0.62, 0.72],
      [-0.98, -0.08],
    ],
  ] as const;
  const scale = 0.006 + (routeIndex % 3) * 0.0011;
  const lonScale = scale / Math.max(Math.cos((latitude * Math.PI) / 180), 0.45);
  const route = routes[routeIndex % routes.length];
  return route.map(([x, y]) => [
    longitude + x * lonScale,
    latitude + y * scale,
  ]);
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
  route: [number, number][];
  state: VehicleState;
  index: number;
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

function vehicleMotion(
  index: number,
  count: number,
  seed: number,
  seconds: number,
): VehicleMotion {
  const phase =
    ((index / Math.max(count, 1)) * 24 + seededUnit(seed, index, 17) * 2) % 24;
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

function interpolateRoute(route: [number, number][], progress: number) {
  const scaled = Math.max(0, Math.min(0.9999, progress)) * (route.length - 1);
  const segment = Math.floor(scaled);
  const fraction = scaled - segment;
  const from = route[segment];
  const to = route[Math.min(segment + 1, route.length - 1)];
  return [
    from[0] + (to[0] - from[0]) * fraction,
    from[1] + (to[1] - from[1]) * fraction,
  ] as [number, number];
}

const fallbackRoutes: [number, number][][] = [
  [
    [70, 400],
    [190, 345],
    [330, 405],
    [510, 370],
    [700, 315],
    [900, 270],
    [940, 430],
    [510, 480],
    [70, 400],
  ],
  [
    [190, 45],
    [255, 140],
    [225, 280],
    [390, 500],
    [560, 410],
    [700, 250],
    [690, 55],
    [440, 80],
    [190, 45],
  ],
  [
    [690, 45],
    [620, 165],
    [770, 305],
    [740, 500],
    [570, 445],
    [430, 305],
    [300, 220],
    [440, 90],
    [690, 45],
  ],
  [
    [260, 282],
    [365, 190],
    [520, 222],
    [650, 318],
    [820, 410],
    [900, 320],
    [760, 180],
    [500, 155],
    [260, 282],
  ],
];

function FallbackSimulationMap({
  cityName,
  simulationActive,
  fleetSize,
  seed,
  reducedMotion,
  message,
}: {
  cityName: string;
  simulationActive: boolean;
  fleetSize: number;
  seed: number;
  reducedMotion: boolean;
  message: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!simulationActive || reducedMotion) return;
    const started = performance.now();
    const timer = window.setInterval(
      () => setElapsed((performance.now() - started) / 1000),
      120,
    );
    return () => window.clearInterval(timer);
  }, [simulationActive, reducedMotion, seed]);
  const visibleVehicles = vehicleCount(fleetSize);
  const vehicles = Array.from({ length: visibleVehicles }, (_, index) => {
    const motion = vehicleMotion(index, visibleVehicles, seed, elapsed);
    const point = interpolateRoute(
      fallbackRoutes[motion.routeIndex],
      motion.progress,
    );
    return { ...motion, point };
  });
  const mapDescription =
    `Illustrative fleet map for ${cityName}. ` +
    "Vehicle dots and routes are not returned by the simulation API.";
  return (
    <div className="mapbox-frame sim-map-frame">
      <div
        className="fallback-street-map"
        role="img"
        aria-label={mapDescription}
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
            d="M-40 400 C180 340 300 455 510 370 S820 320 1040 225"
            fill="none"
            stroke="#55cfc6"
            strokeOpacity=".7"
            strokeWidth="2"
            strokeDasharray="8 10"
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
          <path
            d="M250 282 C365 190 520 222 650 318 S820 410 899 320"
            fill="none"
            stroke="#65e2d5"
            strokeWidth="3"
            strokeOpacity=".9"
          />
          <path
            d="M250 282 C365 190 520 222 650 318 S820 410 899 320"
            fill="none"
            stroke="#65e2d5"
            strokeWidth="13"
            strokeOpacity=".13"
          />
          <path
            d="M290 446 C420 385 495 180 728 154"
            fill="none"
            stroke="#86adff"
            strokeWidth="2"
            strokeDasharray="6 7"
          />
          <path
            d="M70 400 C190 345 330 405 510 370 S790 310 940 270 C965 350 730 460 510 480 S180 475 70 400"
            fill="none"
            stroke="#65e2d5"
            strokeWidth="2"
            strokeOpacity=".56"
            strokeDasharray="7 7"
          />
          <path
            d="M190 45 C255 140 225 280 390 500 S650 385 700 250 S690 60 440 80 Z"
            fill="none"
            stroke="#86adff"
            strokeWidth="2"
            strokeOpacity=".5"
            strokeDasharray="7 8"
          />
          <path
            d="M690 45 C620 165 770 305 740 500 S430 380 300 220 S440 90 690 45 Z"
            fill="none"
            stroke="#ffbd75"
            strokeWidth="2"
            strokeOpacity=".45"
            strokeDasharray="7 8"
          />
        </svg>
        {simulationActive &&
          vehicles.map((vehicle) => (
            <span
              aria-label={`Illustrative vehicle ${vehicle.index + 1}, ${vehicle.state}`}
              className={`fallback-car ${vehicle.state}`}
              data-state={vehicle.state}
              key={vehicle.index}
              style={{
                left: `${vehicle.point[0] / 10}%`,
                top: `${vehicle.point[1] / 5.6}%`,
              }}
              title={`Vehicle ${vehicle.index + 1} · ${vehicle.state}`}
            >
              <i aria-hidden="true" />
            </span>
          ))}
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
        <span className="route-key">Route preview</span>
      </div>
      <div className="mapbox-disclaimer">
        Illustrative route preview · API returns hourly aggregates, not
        per-vehicle paths
      </div>
      {simulationActive && !reducedMotion && (
        <span className="mapbox-sim-playing">
          <span className="mapbox-live-dot" /> ILLUSTRATIVE FLEET PREVIEW ·
          MOVING
        </span>
      )}
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
          style: "mapbox://styles/mapbox/light-v11",
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
    const map = mapRef.current;
    const mapbox = window.mapboxgl;
    if (!mapReady || !map || !mapbox) return;
    const routes = Array.from({ length: routeCount }, (_, index) =>
      routeCoordinates(longitude, latitude, index),
    );
    const feature: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: "FeatureCollection",
      features: routes.map((route, index) => ({
        type: "Feature",
        properties: { route: index + 1 },
        geometry: { type: "LineString", coordinates: route },
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
    if (!simulationActive) return;
    const count = vehicleCount(fleetSize);
    vehicleMarkers.current = Array.from({ length: count }, (_, index) => {
      const motion = vehicleMotion(index, count, seed, 0);
      const route = routes[motion.routeIndex];
      const element = markerElement(
        `mapbox-vehicle-marker ${motion.state}`,
        `Illustrative vehicle ${index + 1}, ${motion.state}`,
        false,
      );
      element.dataset.state = motion.state;
      element.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 32"><path class="car-body" d="M7 2h10l4 7v14l-4 7H7l-4-7V9z"/><path class="car-window" d="M7 9h10l2 5H5zM5 17h14l-2 6H7z"/></svg>`;
      const marker = new mapbox.Marker({ element, anchor: "center" })
        .setLngLat(interpolateRoute(route, motion.progress))
        .addTo(map);
      return { marker, element, route, state: motion.state, index };
    });
  }, [mapReady, latitude, longitude, simulationActive, fleetSize, seed]);

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
        vehicle.marker.setLngLat(
          interpolateRoute(vehicle.route, motion.progress),
        );
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [mapReady, simulationActive, reducedMotion, seed, fleetSize]);

  if (!token || mapError)
    return (
      <FallbackSimulationMap
        cityName={cityName}
        simulationActive={simulationActive}
        fleetSize={fleetSize}
        seed={seed}
        reducedMotion={reducedMotion}
        message={
          mapError
            ? `Mapbox unavailable: ${mapError}. Showing an illustrative street grid.`
            : "Add NEXT_PUBLIC_MAPBOX_TOKEN for Mapbox streets. Preview below is illustrative."
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
        <span className="route-key">Route preview</span>
      </div>
      {simulationActive && (
        <span className="mapbox-fleet-count">
          {vehicleCount(fleetSize)} of {fleetSize} illustrative vehicles shown
        </span>
      )}
      <div className="mapbox-disclaimer">
        Illustrative movement · API returns hourly aggregates, not vehicle paths
      </div>
      {simulationActive && !reducedMotion && (
        <span className="mapbox-sim-playing">
          <span className="mapbox-live-dot" />
          {playing
            ? `FLEET PREVIEW · PLAYING HOUR ${activeHour + 1}`
            : "FLEET PREVIEW · MOVING"}
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
