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
import { ProvidenceRoadNetwork } from "@/lib/providence-road-routing";
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
  const [roadNetwork, setRoadNetwork] = useState<ProvidenceRoadNetwork | null>(
    null,
  );
  const [roadStatus, setRoadStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
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
  const isProvidence = cityName.toLowerCase().includes("providence");
  const activeRoadNetwork = isProvidence ? roadNetwork : null;
  const mapVehicles = useMemo(() => {
    if (!project) return [];
    return vehicles.map((vehicle) => {
      const segment = vehicle.segment;
      const from = project(segment.from_x_miles, segment.from_y_miles);
      const to = project(segment.to_x_miles, segment.to_y_miles);
      const route = activeRoadNetwork?.route(from, to);
      const fraction = Math.max(
        0,
        Math.min(
          1,
          (minute - segment.start_minute) /
            (segment.end_minute - segment.start_minute || 1),
        ),
      );
      return {
        ...vehicle,
        point: route?.at(fraction) ?? project(vehicle.x, vehicle.y),
        route,
      };
    });
  }, [vehicles, project, activeRoadNetwork, minute]);
  const focusOnMap = mapVehicles.find((vehicle) => vehicle.id === selected);
  const unroutedCount = activeRoadNetwork
    ? mapVehicles.filter(
        (vehicle) =>
          !vehicle.route &&
          (vehicle.segment.from_x_miles !== vehicle.segment.to_x_miles ||
            vehicle.segment.from_y_miles !== vehicle.segment.to_y_miles),
      ).length
    : 0;
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
    if (!isProvidence || !token) {
      setRoadNetwork(null);
      return;
    }
    let active = true;
    setRoadStatus("loading");
    fetch("/gis/providence-roads.geojson")
      .then((response) => {
        if (!response.ok) throw new Error("Providence roads unavailable");
        return response.json() as Promise<GeoJSON.FeatureCollection>;
      })
      .then((data) => {
        if (!active) return;
        setRoadNetwork(new ProvidenceRoadNetwork(data));
        setRoadStatus("ready");
      })
      .catch(() => {
        if (active) setRoadStatus("unavailable");
      });
    return () => {
      active = false;
    };
  }, [isProvidence, token]);
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
          style: "mapbox://styles/mapbox/standard-satellite",
          config: {
            basemap: {
              lightPreset: "day",
              show3dObjects: true,
              show3dBuildings: true,
              show3dFacades: true,
              show3dLandmarks: true,
            },
          },
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
            if (isProvidence) {
              map.addSource("providence-roads", {
                type: "geojson",
                data: "/gis/providence-roads.geojson",
              });
              map.addLayer({
                id: "providence-roads",
                type: "line",
                slot: "middle",
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
                slot: "middle",
                source: "providence-buildings",
                minzoom: 8,
                maxzoom: 14.5,
                paint: {
                  "fill-extrusion-color": "#aebec4",
                  "fill-extrusion-height": ["coalesce", ["get", "height_m"], 0],
                  "fill-extrusion-base": 0,
                  "fill-extrusion-opacity": 0.72,
                },
              });
            }
            const empty = { type: "FeatureCollection", features: [] };
            map.addSource("fleet-points", { type: "geojson", data: empty });
            map.addSource("fleet-route", { type: "geojson", data: empty });
            map.addLayer({
              id: "fleet-route",
              type: "line",
              slot: "top",
              source: "fleet-route",
              paint: {
                "line-color": "#334155",
                "line-width": 2,
                "line-dasharray": [2, 2],
              },
            });
            map.addLayer({
              id: "fleet-points",
              type: "circle",
              slot: "top",
              source: "fleet-points",
              paint: {
                "circle-color": ["get", "color"],
                "circle-radius": ["case", ["get", "selected"], 8, 5],
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
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
  }, [token, project, bounds, isProvidence]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !project) return;
    const points: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: "FeatureCollection",
      features: [],
    };
    for (const vehicle of mapVehicles) {
      const color = vehicleStates[vehicle.segment.state].color;
      points.features.push({
        type: "Feature",
        properties: {
          color,
          selected: vehicle.id === selected,
        },
        geometry: { type: "Point", coordinates: vehicle.point },
      });
    }
    map.getSource("fleet-points")?.setData(points);
    map.getSource("fleet-route")?.setData({
      type: "FeatureCollection",
      features: focusOnMap
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: focusOnMap.route?.points ?? [
                  project(
                    focusOnMap.segment.from_x_miles,
                    focusOnMap.segment.from_y_miles,
                  ),
                  project(
                    focusOnMap.segment.to_x_miles,
                    focusOnMap.segment.to_y_miles,
                  ),
                ],
              },
            },
          ]
        : [],
    });
  }, [ready, project, mapVehicles, focusOnMap, selected]);

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
              {isProvidence && token && (
                <small className="fleet-route-status" role="status">
                  {roadStatus === "loading"
                    ? "Preparing city road paths…"
                    : roadStatus === "unavailable"
                      ? "City road paths unavailable"
                      : unroutedCount
                        ? `City road paths · ${unroutedCount} leg${unroutedCount === 1 ? "" : "s"} using straight fallback`
                        : "City road paths active"}
                </small>
              )}
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
                    <circle
                      data-testid="fleet-vehicle"
                      data-state={v.segment.state}
                      key={v.id}
                      cx={300 + (v.x / bounds) * 185}
                      cy={200 - (v.y / bounds) * 185}
                      r={v.id === selected ? 7 : 4.5}
                      fill={vehicleStates[v.segment.state].color}
                      stroke="#fff"
                      strokeWidth="1.5"
                    >
                      <title>
                        Vehicle {v.id}: {vehicleStates[v.segment.state].label}
                      </title>
                    </circle>
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
                      center: focusOnMap
                        ? focusOnMap.point
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
        Hypothetical fleet, not live Waymo operations. The event engine still
        calculates trip timing from its own assumptions.{" "}
        {isProvidence && roadStatus === "ready"
          ? "Moving circles follow shortest paths on the published Providence road centerlines for display when both endpoints can be connected; other legs use straight interpolation. One-way rules, traffic, turns, and travel time are not modeled."
          : "The displayed positions interpolate the engine endpoints; a road path is unavailable."}{" "}
        Mapbox Standard Satellite provides imagery and detailed 3D buildings
        where its coverage permits. City GIS footprints and heights provide the
        city-wide building layer.
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
          (item modified January 2025). Individual records may be older. Missing
          or nonpositive building heights render flat. The road path is a visual
          approximation, not verified navigation guidance.
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
