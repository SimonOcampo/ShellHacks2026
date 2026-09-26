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
          attributionControl: true,
        });
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
): [number, number][] {
  const scale = 0.009;
  const lon = scale / Math.max(Math.cos((latitude * Math.PI) / 180), 0.45);
  return [
    [longitude - lon, latitude - scale * 0.5],
    [longitude - lon * 0.25, latitude - scale],
    [longitude + lon * 0.9, latitude - scale * 0.35],
    [longitude + lon * 0.55, latitude + scale * 0.75],
    [longitude - lon * 0.5, latitude + scale],
    [longitude - lon, latitude - scale * 0.5],
  ];
}

function FallbackSimulationMap({
  cityName,
  activeHour,
  playing,
  message,
}: {
  cityName: string;
  activeHour: number;
  playing: boolean;
  message: string;
}) {
  const progress = ((activeHour % 24) / 24) * 100;
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
          preserveAspectRatio="xMidYMid slice"
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
        </svg>
        <span
          className="fallback-car idle"
          style={{ left: `${15 + progress * 0.5}%`, top: "57%" }}
        >
          <i /> IDLE
        </span>
        <span
          className="fallback-car pickup"
          style={{ left: `${44 + progress * 0.28}%`, top: "38%" }}
        >
          <i /> PICKUP
        </span>
        <span
          className="fallback-car dropoff"
          style={{ left: `${72 - progress * 0.3}%`, top: "70%" }}
        >
          <i /> DROPOFF
        </span>
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
      {playing && (
        <span className="mapbox-sim-playing">
          <span className="mapbox-live-dot" /> PLAYING HOUR {activeHour + 1}
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
}: {
  cityName: string;
  latitude: number;
  longitude: number;
  activeHour: number;
  playing: boolean;
  reducedMotion: boolean;
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const vehicleMarkers = useRef<Marker[]>([]);
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
          style: "mapbox://styles/mapbox/navigation-night-v1",
          center: [longitude, latitude],
          zoom: 12.2,
          attributionControl: true,
        });
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
      vehicleMarkers.current.forEach((marker) => marker.remove());
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
    const route = routeCoordinates(longitude, latitude);
    const feature: GeoJSON.Feature<GeoJSON.LineString> = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: route },
    };
    try {
      map.addSource("odd-scout-illustrative-route", {
        type: "geojson",
        data: feature,
      });
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
    const statuses = ["idle", "pickup", "dropoff"] as const;
    const points = [0.18, 0.48, 0.78].map(
      (amount) => route[Math.round(amount * (route.length - 1))],
    );
    vehicleMarkers.current.forEach((marker) => marker.remove());
    vehicleMarkers.current = statuses.map((status, index) => {
      const element = markerElement(
        `mapbox-vehicle-marker ${status}`,
        `${status === "pickup" ? "Picking up" : status === "dropoff" ? "Dropping off" : "Idle"} vehicle. Illustrative.`,
        false,
      );
      element.innerHTML = `<span aria-hidden="true">${index + 1}</span>`;
      return new mapbox.Marker({ element, anchor: "center" })
        .setLngLat(points[index])
        .addTo(map);
    });
    map.easeTo({
      center: [longitude, latitude],
      zoom: 12.2,
      duration: reducedMotion ? 0 : 900,
    });
  }, [mapReady, latitude, longitude]);

  useEffect(() => {
    if (
      !mapReady ||
      !playing ||
      reducedMotion ||
      vehicleMarkers.current.length !== 3
    )
      return;
    const interval = window.setInterval(() => {
      const route = routeCoordinates(longitude, latitude);
      const phase = (Date.now() / 2200 + activeHour * 0.31) % 1;
      vehicleMarkers.current.forEach((marker, index) => {
        const position = (phase + index * 0.34) % 1;
        const scaled = position * (route.length - 1);
        const segment = Math.floor(scaled);
        const fraction = scaled - segment;
        const from = route[segment];
        const to = route[Math.min(segment + 1, route.length - 1)];
        marker.setLngLat([
          from[0] + (to[0] - from[0]) * fraction,
          from[1] + (to[1] - from[1]) * fraction,
        ]);
      });
    }, 80);
    return () => window.clearInterval(interval);
  }, [mapReady, playing, reducedMotion, activeHour, latitude, longitude]);

  if (!token || mapError)
    return (
      <FallbackSimulationMap
        cityName={cityName}
        activeHour={activeHour}
        playing={playing && !reducedMotion}
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
      <div className="mapbox-disclaimer">
        Illustrative route preview · API returns hourly aggregates, not
        per-vehicle paths
      </div>
      {playing && !reducedMotion && (
        <span className="mapbox-sim-playing">
          <span className="mapbox-live-dot" /> PLAYING HOUR {activeHour + 1}
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
