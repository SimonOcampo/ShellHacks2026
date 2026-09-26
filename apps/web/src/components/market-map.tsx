"use client";
import { useEffect, useState } from "react";
import { geoAlbersUsa, geoArea, geoPath } from "d3-geo";
import type { FeatureCollection, Position } from "geojson";
import type { CityList, Ranking } from "@/lib/api/types";
import { Button } from "@/components/ui/button";

export default function MarketMap({
  cities,
  ranking,
  selected,
  onSelect,
}: {
  cities: CityList["cities"];
  ranking: Ranking;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [states, setStates] = useState<FeatureCollection | null>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState("");
  const [mapRetry, setMapRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setMapLoading(true);
    setMapError("");
    fetch("/us-states.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Map outline request failed (${response.status})`);
        return response.json();
      })
      .then((data: FeatureCollection) => {
        // D3 uses spherical clockwise exteriors; upstream GeoJSON mixes winding.
        const orient = (rings: Position[][]) =>
          geoArea({ type: "Polygon", coordinates: rings }) > 2 * Math.PI
            ? rings.map((ring) => [...ring].reverse())
            : rings;
        for (const feature of data.features) {
          if (feature.geometry.type === "Polygon")
            feature.geometry.coordinates = orient(feature.geometry.coordinates);
          if (feature.geometry.type === "MultiPolygon")
            feature.geometry.coordinates =
              feature.geometry.coordinates.map(orient);
        }
        if (!controller.signal.aborted) setStates(data);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMapError(
            error instanceof Error
              ? error.message
              : "Map outlines could not load.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setMapLoading(false);
      });
    return () => controller.abort();
  }, [mapRetry]);
  const projection = geoAlbersUsa().scale(940).translate([420, 240]);
  const path = geoPath(projection);
  const ranks = new Map(ranking.ranked.map((r) => [r.city_id, r.rank ?? 99]));
  return (
    <div className="map-wrap">
      <svg
        viewBox="0 0 840 490"
        role="group"
        aria-label="U.S. candidate metro map. Each metro marker is keyboard-operable; the ranked list is an alternate selection method."
      >
        <defs>
          <radialGradient id="map-glow">
            <stop stopColor="#28c5ae" stopOpacity=".08" />
            <stop offset="1" stopColor="#28c5ae" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse
          cx="420"
          cy="250"
          rx="380"
          ry="220"
          fill="url(#map-glow)"
          aria-hidden="true"
        />
        {[100, 200, 300, 400].map((y) => (
          <line
            key={`y${y}`}
            x1="30"
            x2="810"
            y1={y}
            y2={y}
            className="map-grid"
            aria-hidden="true"
          />
        ))}
        {[100, 200, 300, 400, 500, 600, 700].map((x) => (
          <line
            key={`x${x}`}
            y1="40"
            y2="450"
            x1={x}
            x2={x}
            className="map-grid"
            aria-hidden="true"
          />
        ))}
        {states?.features
          .filter(
            (f) =>
              !["Alaska", "Hawaii", "Puerto Rico"].includes(f.properties?.name),
          )
          .map((f, i) => (
            <path
              key={i}
              d={path(f) ?? ""}
              className="state-path"
              aria-hidden="true"
            />
          ))}
        {cities.map((city) => {
          const point = projection([city.longitude, city.latitude]);
          if (!point) return null;
          const rank = ranks.get(city.city_id) ?? 99;
          const active = city.city_id === selected;
          return (
            <g
              key={city.city_id}
              className={`map-marker ${active ? "active" : ""} ${rank <= 3 ? "top" : ""}`}
              transform={`translate(${point[0]},${point[1]})`}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              aria-label={`${city.display_name}, ${rank < 99 ? `rank ${rank}` : "unranked"}`}
              onClick={() => onSelect(city.city_id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(city.city_id);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              <title>
                {city.display_name}, {rank < 99 ? `rank ${rank}` : "unranked"}
              </title>
              {active && <circle r="19" className="marker-halo" />}
              <circle r={active ? 7 : rank <= 3 ? 5 : 3.5} />
              {(active || rank <= 3) && (
                <text x="12" y="-10">
                  {city.display_name}
                </text>
              )}
            </g>
          );
        })}
        <text x="34" y="464" className="map-caption">
          CONTIGUOUS UNITED STATES · CBSA MARKERS
        </text>
      </svg>
      {!states && mapLoading && (
        <span className="map-fallback" role="status" aria-live="polite">
          Map outlines loading · ranked list remains available
        </span>
      )}
      {!states && mapError && (
        <div className="map-fallback map-error" role="alert">
          <span>
            Map outlines failed: {mapError}. City ranking remains available.
          </span>
          <Button
            variant="outline"
            onClick={() => setMapRetry((value) => value + 1)}
          >
            Retry map
          </Button>
        </div>
      )}
      {cities.length === 0 && (
        <p className="empty" role="status">
          No metro locations were returned for this release.
        </p>
      )}
      <div className="map-legend">
        <span>
          <i className="dot teal" /> Top three
        </span>
        <span>
          <i className="dot" /> Candidate metro
        </span>
        <span>Markers ≠ service boundaries</span>
      </div>
    </div>
  );
}
