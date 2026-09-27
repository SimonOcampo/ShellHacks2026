"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Map, Maximize2, RotateCcw } from "lucide-react";
import type { CityList, Ranking } from "@/lib/api/types";
import MarketMap from "./market-map";

type City = CityList["cities"][number];
export type MapInstance = {
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
    pitch?: number;
    bearing?: number;
  }) => void;
  remove: () => void;
  resize: () => void;
  fitBounds: (
    bounds: [[number, number], [number, number]],
    options: { padding: number; duration: number; maxZoom?: number },
  ) => void;
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

export function loadMapbox() {
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
