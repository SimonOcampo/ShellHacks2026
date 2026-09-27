"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Simulation } from "@/lib/api/types";
import {
  geographicFrame,
  indexPlayback,
  vehicleAt,
  vehicleStates,
} from "@/lib/simulation-playback";
import { loadMapbox, type MapInstance } from "./mapbox-map";
import { fleetCarIcon } from "./fleet-car-icon";
import "./fleet-playback.css";

export function FleetPlaybackMap({
  result,
  minute,
  cityName,
  skyline,
  reducedMotion,
  busy,
}: {
  result?: Simulation;
  minute: number;
  cityName: string;
  skyline?: string;
  reducedMotion: boolean;
  busy: boolean;
}) {
  const playback = result?.playback;
  const index = useMemo(() => indexPlayback(playback), [playback]);
  const project = useMemo(() => geographicFrame(playback), [playback]);
  const [selected, setSelected] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const vehicles = useMemo(
    () =>
      [...index.entries()].flatMap(([id, segments]) => {
        const frame = vehicleAt(segments, minute);
        return frame ? [{ id, ...frame }] : [];
      }),
    [index, minute],
  );
  const focus = vehicles.find((vehicle) => vehicle.id === selected);
  const bounds = useMemo(() => {
    let radius = 1;
    for (const segment of playback?.segments ?? [])
      radius = Math.max(
        radius,
        Math.abs(segment.from_x_miles),
        Math.abs(segment.from_y_miles),
        Math.abs(segment.to_x_miles),
        Math.abs(segment.to_y_miles),
      );
    return radius * 1.1;
  }, [playback]);

  useEffect(() => {
    setSelected(null);
  }, [playback]);
  useEffect(() => {
    if (!token || !project || !container.current) return;
    let active = true;
    let map: MapInstance | undefined;
    const observer = new ResizeObserver(() => map?.resize());
    observer.observe(container.current);
    setReady(false);
    setError("");
    loadMapbox()
      .then((api) => {
        if (!active || !container.current) return;
        map = new api.Map({
          container: container.current,
          accessToken: token,
          style: "mapbox://styles/mapbox/light-v11",
          center: project(0, 0),
          zoom: 12.8,
          pitch: 55,
          bearing: -20,
          attributionControl: true,
        });
        mapRef.current = map;
        map.once("load", () => {
          if (!active || !map) return;
          try {
            if (cityName.toLowerCase().includes("providence")) {
              map.addSource("providence-roads", {
                type: "geojson",
                data: "/gis/providence-roads.geojson",
              });
              map.addLayer({
                id: "providence-roads",
                type: "line",
                source: "providence-roads",
                minzoom: 8,
                paint: {
                  "line-color": "#58768a",
                  "line-opacity": 0.46,
                  "line-width": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    10,
                    0.5,
                    16,
                    2,
                  ],
                },
              });
              map.addSource("providence-buildings", {
                type: "geojson",
                data: "/gis/providence-buildings.geojson",
              });
              map.addLayer({
                id: "providence-buildings",
                type: "fill-extrusion",
                source: "providence-buildings",
                minzoom: 8,
                paint: {
                  "fill-extrusion-color": "#aebec4",
                  "fill-extrusion-height": ["coalesce", ["get", "height_m"], 0],
                  "fill-extrusion-base": 0,
                  "fill-extrusion-opacity": 0.72,
                },
              });
            } else {
              map.addLayer({
                id: "fleet-buildings",
                type: "fill-extrusion",
                source: "composite",
                "source-layer": "building",
                filter: ["==", "extrude", "true"],
                minzoom: 12,
                paint: {
                  "fill-extrusion-color": "#bcc9cc",
                  "fill-extrusion-height": ["get", "height"],
                  "fill-extrusion-base": ["get", "min_height"],
                  "fill-extrusion-opacity": 0.55,
                },
              });
            }
            const empty = { type: "FeatureCollection", features: [] };
            map.addSource("fleet-cars", { type: "geojson", data: empty });
            map.addSource("fleet-bodies", { type: "geojson", data: empty });
            map.addSource("fleet-route", { type: "geojson", data: empty });
            map.addLayer({
              id: "fleet-route",
              type: "line",
              source: "fleet-route",
              paint: {
                "line-color": "#334155",
                "line-width": 2,
                "line-dasharray": [2, 2],
              },
            });
            for (const [state, value] of Object.entries(vehicleStates))
              map.addImage(`fleet-car-${state}`, fleetCarIcon(value.color), {
                pixelRatio: 2,
              });
            map.addLayer({
              id: "fleet-car-icons",
              type: "symbol",
              source: "fleet-cars",
              layout: {
                "icon-image": ["concat", "fleet-car-", ["get", "state"]],
                "icon-size": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  9,
                  0.6,
                  15,
                  1.1,
                ],
                "icon-rotate": ["get", "bearing"],
                "icon-rotation-alignment": "map",
                "icon-allow-overlap": true,
              },
            });
            map.addLayer({
              id: "fleet-bodies",
              type: "fill-extrusion",
              source: "fleet-bodies",
              minzoom: 15,
              paint: {
                "fill-extrusion-color": ["get", "color"],
                "fill-extrusion-height": ["get", "height"],
                "fill-extrusion-base": ["get", "base"],
                "fill-extrusion-opacity": 1,
              },
            });
            setReady(true);
            map.fitBounds(
              [project(-bounds, -bounds), project(bounds, bounds)],
              { padding: 40, duration: 0, maxZoom: 13.5 },
            );
          } catch {
            setError(
              "3D layers are unavailable. Showing the same engine positions in local coordinates.",
            );
          }
        });
      })
      .catch(() => {
        if (active)
          setError("Mapbox could not load. Showing local engine coordinates.");
      });
    return () => {
      active = false;
      observer.disconnect();
      map?.remove();
      mapRef.current = null;
    };
  }, [token, project, bounds, cityName]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !project) return;
    const cars: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: "FeatureCollection",
      features: [],
    };
    const bodies: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
      type: "FeatureCollection",
      features: [],
    };
    for (const vehicle of vehicles) {
      const color = vehicleStates[vehicle.segment.state].color;
      cars.features.push({
        type: "Feature",
        properties: {
          state: vehicle.segment.state,
          bearing: 90 - (vehicle.angle * 180) / Math.PI,
        },
        geometry: { type: "Point", coordinates: project(vehicle.x, vehicle.y) },
      });
      // Stylized autonomous minivan body, cabin, and roof sensor, enlarged for legibility.
      for (const [length, width, base, height, tint] of [
        [8.5, 3.8, 0, 2.2, "#eef3f5"],
        [5.2, 3.2, 2.2, 3.2, "#243746"],
        [3.4, 2.4, 3.2, 3.35, color],
        [0.9, 0.9, 3.35, 4.05, "#e5eaf0"],
      ] as const) {
        const coordinates = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
          [-1, -1],
        ].map(([a, b]) => {
          const dx = (a * length) / 2 / 1609.344,
            dy = (b * width) / 2 / 1609.344;
          return project(
            vehicle.x +
              dx * Math.cos(vehicle.angle) -
              dy * Math.sin(vehicle.angle),
            vehicle.y +
              dx * Math.sin(vehicle.angle) +
              dy * Math.cos(vehicle.angle),
          );
        });
        bodies.features.push({
          type: "Feature",
          properties: { color: tint, base, height },
          geometry: { type: "Polygon", coordinates: [coordinates] },
        });
      }
    }
    map.getSource("fleet-cars")?.setData(cars);
    map.getSource("fleet-bodies")?.setData(bodies);
    map.getSource("fleet-route")?.setData({
      type: "FeatureCollection",
      features: focus
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: [
                  project(
                    focus.segment.from_x_miles,
                    focus.segment.from_y_miles,
                  ),
                  project(focus.segment.to_x_miles, focus.segment.to_y_miles),
                ],
              },
            },
          ]
        : [],
    });
  }, [ready, project, vehicles, focus]);

  const local = !token || !project || Boolean(error);
  return (
    <section className="fleet-playback" aria-label="Engine vehicle playback">
      <div className="fleet-visual-row">
        <div className="fleet-photo-panel">
          <img
            src={skyline ?? "/nashville-skyline.jpg"}
            alt={`${skyline ? cityName : "Nashville"} skyline, illustrative city context`}
          />
          <span>
            {skyline
              ? cityName.toUpperCase()
              : `ILLUSTRATIVE NASHVILLE SKYLINE · ${cityName.toUpperCase()} SCENARIO`}
            <small>HYPOTHETICAL FLEET</small>
          </span>
        </div>
        <div className="fleet-map-panel">
          <div className="fleet-map-heading">
            <div>
              <span className="eyebrow">ENGINE PLAYBACK</span>
              <h3>{cityName}</h3>
            </div>
            <span>
              {busy
                ? "Updating scenario…"
                : playback
                  ? `${vehicles.length} vehicles · ${minute.toFixed(1)} min`
                  : "Vehicle trace unavailable"}
            </span>
          </div>
          <div className="fleet-map-stage">
            <div
              ref={container}
              className="fleet-map-canvas"
              style={{ visibility: local ? "hidden" : "visible" }}
              role="region"
              aria-label="3D Providence fleet map"
            />
            {local && (
              <div className="fleet-local-view">
                <svg
                  viewBox="0 0 600 400"
                  role="img"
                  aria-label="Vehicle positions in local miles; no street basemap"
                >
                  <path
                    d="M300 30V370M30 200H570"
                    stroke="#b7c6ce"
                    strokeDasharray="4 6"
                  />
                  {vehicles.map((v) => (
                    <g
                      data-testid="fleet-vehicle"
                      data-state={v.segment.state}
                      key={v.id}
                      transform={`translate(${300 + (v.x / bounds) * 185} ${200 - (v.y / bounds) * 185}) rotate(${90 - (v.angle * 180) / Math.PI})`}
                    >
                      <title>
                        Vehicle {v.id}: {vehicleStates[v.segment.state].label}
                      </title>
                      <rect
                        x="-5"
                        y="-9"
                        width="10"
                        height="18"
                        rx="3"
                        fill="#f8fafb"
                        stroke={vehicleStates[v.segment.state].color}
                        strokeWidth={v.id === selected ? 2.5 : 1.7}
                      />
                      <rect
                        x="-3.5"
                        y="-4"
                        width="7"
                        height="5"
                        rx="1.5"
                        fill="#243746"
                      />
                      <circle
                        r="2.2"
                        cy="3"
                        fill={vehicleStates[v.segment.state].color}
                      />
                      <circle r="0.8" cy="3" fill="#f8fafb" />
                    </g>
                  ))}
                  <text x="20" y="385" fill="#475569" fontSize="12">
                    Local miles · north ↑ · extent ±{bounds.toFixed(1)} miles
                  </text>
                </svg>
                <p>
                  {error ||
                    (playback
                      ? project
                        ? "Local coordinate view. A configured Mapbox token enables the 3D city."
                        : "Synthetic local coordinates. This profile has no geographic city frame."
                      : "Vehicle playback is unavailable for this result. No vehicle movement is inferred.")}
                </p>
              </div>
            )}
            {!local && !ready && (
              <p className="fleet-map-notice" role="status">
                Loading 3D city…
              </p>
            )}
            {!local && ready && (
              <div className="fleet-camera-controls">
                <button
                  type="button"
                  onClick={() =>
                    mapRef.current?.fitBounds(
                      [project!(-bounds, -bounds), project!(bounds, bounds)],
                      {
                        padding: 40,
                        duration: reducedMotion ? 0 : 600,
                        maxZoom: 13.5,
                      },
                    )
                  }
                >
                  Fleet overview
                </button>
                <button
                  type="button"
                  onClick={() =>
                    mapRef.current?.easeTo({
                      center: focus
                        ? project!(focus.x, focus.y)
                        : [-71.4128, 41.824],
                      zoom: 16.5,
                      pitch: 60,
                      duration: reducedMotion ? 0 : 600,
                    })
                  }
                >
                  {focus ? "Inspect vehicle in 3D" : "Downtown 3D"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="fleet-console" aria-label="Vehicle states and inspector">
        <div className="fleet-state-legend">
          {Object.entries(vehicleStates).map(([state, value]) => (
            <span key={state}>
              <i style={{ background: value.color }} aria-hidden="true" />
              {value.label}{" "}
              <b>
                {playback
                  ? vehicles.filter((v) => v.segment.state === state).length
                  : "—"}
              </b>
            </span>
          ))}
        </div>
        {index.size > 0 && (
          <div className="fleet-inspector">
            <label>
              Inspect vehicle{" "}
              <select
                aria-label="Inspect vehicle"
                value={selected ?? ""}
                onChange={(e) =>
                  setSelected(
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              >
                <option value="">Select a vehicle</option>
                {[...index.keys()]
                  .sort((a, b) => a - b)
                  .map((id) => (
                    <option key={id} value={id}>
                      Vehicle {id}
                    </option>
                  ))}
              </select>
            </label>
            <p>
              {focus
                ? `${vehicleStates[focus.segment.state].label} · ${focus.segment.occupied ? "occupied" : "empty"} · ${focus.segment.start_minute.toFixed(1)}–${focus.segment.end_minute.toFixed(1)} min`
                : "Select a vehicle to inspect its current state and leg."}
            </p>
          </div>
        )}
      </div>
      <p className="fleet-disclosure">
        Hypothetical fleet, not live Waymo operations. Positions follow
        straight-line engine legs, which may cross buildings or water; street
        routing is not modeled.{" "}
        {cityName.toLowerCase().includes("providence")
          ? "Providence GIS Hub supplies building footprints, published heights, and road centerlines; Mapbox supplies the basemap."
          : "Mapbox supplies city streets and available building heights."}{" "}
        Car shapes are enlarged symbols.
      </p>
      {cityName.toLowerCase().includes("providence") && (
        <p className="fleet-gis-source">
          City GIS Hub:{" "}
          <a
            href="https://pvdgis.maps.arcgis.com/home/item.html?id=d66b8deed2614d54b18906ba1f532030"
            target="_blank"
            rel="noreferrer"
          >
            building footprints
          </a>{" "}
          (item modified June 2025) and{" "}
          <a
            href="https://pvdgis.maps.arcgis.com/home/item.html?id=8c101a6fca0c4104b9b08499725c6625"
            target="_blank"
            rel="noreferrer"
          >
            road centerlines
          </a>{" "}
          (item modified January 2025). Individual records may be older.
          Missing or nonpositive building heights render flat. GIS geometry is
          reference context, not a drivable route network.
        </p>
      )}
      {result?.demand_source && (
        <details className="fleet-provenance">
          <summary>Demand source and assumptions</summary>
          <p>
            {result.demand_source.source_name} ·{" "}
            {result.demand_source.source_period}
          </p>
          {result.demand_source.source_url && (
            <a
              href={result.demand_source.source_url}
              target="_blank"
              rel="noreferrer"
            >
              View source
            </a>
          )}
          <ul>
            {result.demand_source.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
