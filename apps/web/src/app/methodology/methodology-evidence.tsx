"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import type { City, CityList } from "@/lib/api/types";

type Props = { cityId?: string; source?: string };
type Measurement = City["features"][string];
type ReferenceReleaseContent = {
  cities: City[];
  references: { city_id: string; enabled: boolean; operator: string }[];
};
type MarketOption = {
  cityId: string;
  displayName: string;
  cohort: "candidate" | "reference";
};

const featureOrder = [
  "annual_precipitation_mm",
  "annual_snowfall_mm",
  "hot_days_32c",
  "mean_commute_minutes",
  "road_density_km_per_km2",
  "intersection_density_per_km2",
  "freeway_share",
  "arterial_share",
  "local_road_share",
  "public_dc_ports_per_100k",
  "population_share_in_counties_with_dc",
  "population",
  "population_density_per_km2",
  "zero_vehicle_household_share",
  "transit_commute_share",
  "average_aadt",
  "lane_miles_per_km2",
];

const labels: Record<string, string> = {
  annual_precipitation_mm: "Annual precipitation",
  annual_snowfall_mm: "Annual snowfall",
  hot_days_32c: "Days at or above 90°F",
  mean_commute_minutes: "Mean commute",
  road_density_km_per_km2: "Road density",
  intersection_density_per_km2: "Intersection density",
  freeway_share: "Freeway share",
  arterial_share: "Arterial share",
  local_road_share: "Local-road share",
  public_dc_ports_per_100k: "Public DC ports per 100,000 people",
  population_share_in_counties_with_dc: "Population in counties with public DC",
  population: "Resident population",
  population_density_per_km2: "Population density",
  zero_vehicle_household_share: "Zero-vehicle household share",
  transit_commute_share: "Transit commute share",
  average_aadt: "Average annual daily traffic",
  lane_miles_per_km2: "Lane miles per km²",
};

const provenanceAnchor = (id: string) =>
  `provenance-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

function displayValue(measurement: Measurement) {
  if (measurement.value == null) return "Missing";
  return `${measurement.value.toLocaleString(undefined, {
    maximumFractionDigits: 3,
  })} ${measurement.unit}`;
}

export default function MethodologyEvidence({ cityId, source }: Props) {
  const router = useRouter();
  const [city, setCity] = useState<City>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [markets, setMarkets] = useState<MarketOption[]>([]);
  const [marketListBusy, setMarketListBusy] = useState(true);
  const [marketListError, setMarketListError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const referenceRelease = api.waymoReferenceRelease(
      controller.signal,
    ) as unknown as Promise<ReferenceReleaseContent>;
    Promise.allSettled([api.cities(controller.signal), referenceRelease]).then(
      ([candidateResult, referenceResult]) => {
        if (controller.signal.aborted) return;
        const options: MarketOption[] = [];
        if (candidateResult.status === "fulfilled") {
          options.push(
            ...candidateResult.value.cities.map((candidate) => ({
              cityId: candidate.city_id,
              displayName: candidate.display_name,
              cohort: "candidate" as const,
            })),
          );
        }
        if (referenceResult.status === "fulfilled") {
          const enabledIds = new Set(
            referenceResult.value.references
              .filter(
                (reference) =>
                  reference.enabled && reference.operator === "Waymo",
              )
              .map((reference) => reference.city_id),
          );
          options.push(
            ...referenceResult.value.cities
              .filter((referenceCity) => enabledIds.has(referenceCity.city_id))
              .map((referenceCity) => ({
                cityId: referenceCity.city_id,
                displayName: referenceCity.display_name,
                cohort: "reference" as const,
              })),
          );
        }
        setMarkets(options);
        if (
          candidateResult.status === "rejected" &&
          referenceResult.status === "rejected"
        ) {
          setMarketListError(
            "Market lists are unavailable from the current data services.",
          );
        } else if (
          candidateResult.status === "rejected" ||
          referenceResult.status === "rejected"
        ) {
          setMarketListError(
            "One market list could not be loaded. Available metros are still selectable.",
          );
        }
        setMarketListBusy(false);
      },
    );
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setCity(undefined);
    setError("");
    if (!cityId) {
      setBusy(false);
      return;
    }
    if (!/^cbsa:\d{5}$/.test(cityId)) {
      setBusy(false);
      setError("The selected market ID is not a valid Census CBSA identifier.");
      return;
    }

    const controller = new AbortController();
    setBusy(true);
    const recordPromise =
      source === "waymo"
        ? api
            .waymoReferenceRelease(controller.signal)
            .then((release: { cities: City[] }) => {
              const record = release.cities.find(
                (item) => item.city_id === cityId,
              );
              if (!record)
                throw new Error(
                  "No reference metro record was found in the saved release.",
                );
              return record;
            })
        : api.city(cityId, controller.signal);
    recordPromise
      .then((record) => {
        if (!controller.signal.aborted) setCity(record);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Metro evidence could not be loaded.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [cityId, source]);

  useEffect(() => {
    if (!city) return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    requestAnimationFrame(() => {
      const target = document.getElementById(decodeURIComponent(hash));
      if (target instanceof HTMLDetailsElement) target.open = true;
      target?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    });
  }, [city]);

  const featureEntries = city
    ? Object.entries(city.features).sort(([left], [right]) => {
        const leftIndex = featureOrder.indexOf(left);
        const rightIndex = featureOrder.indexOf(right);
        return (
          (leftIndex < 0 ? 999 : leftIndex) -
          (rightIndex < 0 ? 999 : rightIndex)
        );
      })
    : [];

  return (
    <section
      className="selected-city-evidence"
      id="selected-city-evidence"
      aria-labelledby="selected-city-title"
    >
      <div className="selected-city-intro">
        <span className="method-eyebrow">SELECTED METRO RECORD</span>
        <h3 id="selected-city-title">
          {city?.display_name ??
            (busy ? "Loading metro evidence" : "Inspect a metro record")}
        </h3>
        <p>
          Choose a candidate or public reference market to inspect the release’s
          stored measurements and complete source records. This page does not
          recalculate rankings.
        </p>
      </div>

      <div className="market-record-picker">
        <label htmlFor="methodology-market">Metro record</label>
        <select
          id="methodology-market"
          value={
            cityId
              ? `${source === "waymo" ? "reference" : "candidate"}::${cityId}`
              : ""
          }
          onChange={(event) => {
            const [cohort, nextCityId] = event.target.value.split("::");
            if (!nextCityId) return;
            const params = new URLSearchParams();
            params.set("city", nextCityId);
            if (cohort === "reference") params.set("source", "waymo");
            router.replace(
              `/methodology?${params.toString()}#selected-city-evidence`,
              { scroll: false },
            );
          }}
          disabled={marketListBusy || markets.length === 0}
        >
          <option value="">
            {marketListBusy ? "Loading available metros…" : "Select a metro"}
          </option>
          <optgroup label="Candidate expansion markets">
            {markets
              .filter((market) => market.cohort === "candidate")
              .map((market) => (
                <option
                  key={market.cityId}
                  value={`candidate::${market.cityId}`}
                >
                  {market.displayName}
                </option>
              ))}
          </optgroup>
          <optgroup label="Waymo public reference markets">
            {markets
              .filter((market) => market.cohort === "reference")
              .map((market) => (
                <option
                  key={market.cityId}
                  value={`reference::${market.cityId}`}
                >
                  {market.displayName}
                </option>
              ))}
          </optgroup>
        </select>
      </div>
      {marketListError && (
        <p className="method-inline-status" role="status">
          {marketListError}
        </p>
      )}
      {!cityId && !busy && !error && (
        <p className="market-record-hint">
          Exact feature values, missing reasons, and full provenance records
          appear here after you choose a metro.
        </p>
      )}

      {busy && (
        <p className="method-inline-status" role="status">
          Loading selected metro evidence…
        </p>
      )}
      {error && (
        <p className="method-inline-error" role="alert">
          Metro evidence could not load: {error}
        </p>
      )}

      {city && (
        <>
          <dl className="selected-city-meta">
            <div>
              <dt>City ID</dt>
              <dd>{city.city_id}</dd>
            </div>
            <div>
              <dt>Official CBSA name</dt>
              <dd>{city.official_name}</dd>
            </div>
            <div>
              <dt>Data mode</dt>
              <dd>{city.versions.data_mode}</dd>
            </div>
            <div>
              <dt>Data release</dt>
              <dd>{city.versions.data_version}</dd>
            </div>
            <div>
              <dt>Model / schema</dt>
              <dd>
                {city.versions.model_version} · {city.versions.schema_version}
              </dd>
            </div>
            <div>
              <dt>Geographic vintage</dt>
              <dd>{city.geography_vintage}</dd>
            </div>
            <div>
              <dt>States in CBSA</dt>
              <dd>{city.state_codes.join(", ") || "Not recorded"}</dd>
            </div>
          </dl>

          <div className="selected-evidence-heading">
            <div>
              <span>01 / MEASUREMENTS</span>
              <h4>Stored feature values</h4>
            </div>
            <small>Raw release values · quality · evidence IDs</small>
          </div>
          <div className="selected-measurement-list">
            {featureEntries.map(([key, measurement]) => (
              <article className="selected-measurement-row" key={key}>
                <div>
                  <h5>{labels[key] ?? key}</h5>
                  <code>{key}</code>
                </div>
                <strong
                  className={measurement.value == null ? "is-missing" : ""}
                >
                  {displayValue(measurement)}
                </strong>
                <span className={`quality-chip ${measurement.quality}`}>
                  {measurement.quality}
                </span>
                <div className="selected-measurement-evidence">
                  {measurement.provenance_ids.length ? (
                    measurement.provenance_ids.map((id) => (
                      <a href={`#${provenanceAnchor(id)}`} key={id}>
                        {id}
                      </a>
                    ))
                  ) : (
                    <span>No source record attached</span>
                  )}
                  {measurement.missing_reason && (
                    <small>{measurement.missing_reason}</small>
                  )}
                </div>
              </article>
            ))}
          </div>

          <div className="selected-evidence-heading provenance-list-heading">
            <div>
              <span>02 / EVIDENCE RECORDS</span>
              <h4>Complete provenance</h4>
            </div>
            <small>
              {city.provenance.length} records in this metro release
            </small>
          </div>
          <div className="selected-provenance-list">
            {city.provenance.map((record) => (
              <details
                className="selected-provenance-record"
                id={provenanceAnchor(record.id)}
                key={record.id}
              >
                <summary>
                  <span>{record.source_name}</span>
                  <code>{record.dataset_id}</code>
                  <small>{record.period}</small>
                </summary>
                <dl>
                  <div>
                    <dt>Provenance ID</dt>
                    <dd>
                      <code>{record.id}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Source URL</dt>
                    <dd>
                      {record.source_url.startsWith("https://") ? (
                        <a
                          href={record.source_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {record.source_url}
                        </a>
                      ) : (
                        <code>{record.source_url}</code>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Period</dt>
                    <dd>{record.period}</dd>
                  </div>
                  <div>
                    <dt>Retrieved at</dt>
                    <dd>{record.retrieved_at}</dd>
                  </div>
                  <div>
                    <dt>Source geography</dt>
                    <dd>{record.source_geography}</dd>
                  </div>
                  <div>
                    <dt>Target geography</dt>
                    <dd>{record.target_geography}</dd>
                  </div>
                  <div>
                    <dt>Transformation</dt>
                    <dd>{record.transformation}</dd>
                  </div>
                  <div>
                    <dt>Assumptions</dt>
                    <dd>
                      {record.assumptions.length ? (
                        <ul>
                          {record.assumptions.map((assumption) => (
                            <li key={assumption}>{assumption}</li>
                          ))}
                        </ul>
                      ) : (
                        "None recorded"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Raw SHA-256</dt>
                    <dd>
                      <code className="raw-hash">{record.raw_sha256}</code>
                    </dd>
                  </div>
                </dl>
              </details>
            ))}
          </div>

          <div className="selected-legal-evidence">
            <div>
              <span>03 / LEGAL CONTEXT</span>
              <h4>Outside the numeric score</h4>
            </div>
            {city.legal_evidence.length ? (
              city.legal_evidence.map((item) => (
                <article key={`${item.jurisdiction}-${item.category}`}>
                  <h5>
                    {item.jurisdiction} · {item.category.replaceAll("_", " ")}
                  </h5>
                  <p>{item.summary}</p>
                  <small>
                    Checked {item.checked_at} · Evidence IDs:{" "}
                    {item.provenance_ids.join(", ") || "none"}
                  </small>
                </article>
              ))
            ) : (
              <p>
                No regulatory evidence records were returned for this metro.
                This does not establish a legal status.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
