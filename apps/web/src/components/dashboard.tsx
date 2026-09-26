"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Compass,
  Database,
  ExternalLink,
  FlaskConical,
  Layers3,
  LoaderCircle,
  MapPin,
  Radar,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { api, fixtureMode } from "@/lib/api/client";
import type {
  City,
  CityList,
  Config,
  Explanation,
  Ranking,
  Weights,
} from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import MarketMap from "./market-map";
import Scenario from "./scenario";

const pillarNames = {
  familiarity: "ODD familiarity",
  readiness: "Deployment readiness",
  opportunity: "Market opportunity",
};
const initialWeights: Weights = {
  familiarity: 0.4,
  readiness: 0.2,
  opportunity: 0.4,
};
export default function Dashboard() {
  const [cities, setCities] = useState<CityList>();
  const [config, setConfig] = useState<Config>();
  const [ranking, setRanking] = useState<Ranking>();
  const [weights, setWeights] = useState<Weights>(initialWeights);
  const [selected, setSelected] = useState("");
  const [city, setCity] = useState<City>();
  const [explanation, setExplanation] = useState<Explanation>();
  const [referenceCities, setReferenceCities] = useState<City[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [drawer, setDrawer] = useState<"methodology" | "sources" | null>(null);
  const [tab, setTab] = useState<"markets" | "scenario">("markets");
  const [search, setSearch] = useState("");
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const drawerRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (drawer) drawerRef.current?.showModal();
    else drawerRef.current?.close();
  }, [drawer]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    Promise.all([api.cities(controller.signal), api.config(controller.signal)])
      .then(([c, f]) => {
        setCities(c);
        setConfig(f);
        setWeights(f.weights);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    if (!config) return;
    const controller = new AbortController();
    setBusy(true);
    const timer = setTimeout(
      () =>
        api
          .rank({ weights }, controller.signal)
          .then((r) => {
            if (controller.signal.aborted) return;
            setRanking(r);
            setError("");
            if (!selectedRef.current)
              setSelected(r.ranked[0]?.city_id ?? r.unranked[0]?.city_id ?? "");
          })
          .catch((e) => {
            if (!controller.signal.aborted) setError(e.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setBusy(false);
          }),
      200,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [weights, config, retry]);
  useEffect(() => {
    if (!selected || !ranking) return;
    const controller = new AbortController();
    setCity(undefined);
    setExplanation(undefined);
    Promise.all([
      api.city(selected, controller.signal),
      api.explain(
        selected,
        {
          weights: ranking.normalized_weights,
          reference_ids: ranking.reference_ids,
        },
        controller.signal,
      ),
    ])
      .then(([c, e]) => {
        if (!controller.signal.aborted) {
          setCity(c);
          setExplanation(e);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [selected, ranking]);
  const score =
    ranking &&
    [...ranking.ranked, ...ranking.unranked].find(
      (r) => r.city_id === selected,
    );
  const currentName =
    cities?.cities.find((c) => c.city_id === selected)?.display_name ??
    "Select a market";
  const total = Object.values(weights).reduce<number>(
    (a, b) => a + (b ?? 0),
    0,
  );
  useEffect(() => {
    if (drawer !== "sources" || !score || !config) return;
    const controller = new AbortController();
    setReferenceCities([]);
    const ids = score.reference_matches
      .map(
        (match) =>
          config.references.find((r) => r.id === match.reference_id)?.city_id,
      )
      .filter((id): id is string => !!id);
    Promise.all(ids.map((id) => api.city(id, controller.signal)))
      .then((values) => {
        if (!controller.signal.aborted) setReferenceCities(values);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [drawer, score, config]);
  const visible = [
    ...(ranking?.ranked ?? []),
    ...(ranking?.unranked ?? []),
  ].filter((r) =>
    cities?.cities
      .find((c) => c.city_id === r.city_id)
      ?.display_name.toLowerCase()
      .includes(search.toLowerCase()),
  );
  function adjust(key: keyof Weights, value: number) {
    const next = { ...weights, [key]: value };
    if (Object.values(next).reduce<number>((a, b) => a + (b ?? 0), 0) > 0)
      setWeights(next);
  }
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" aria-label="ODD Scout home">
          <div className="brand-symbol">
            <Radar size={25} />
          </div>
          <span>
            ODD<span className="brand-light">SCOUT</span>
            <small>EXPANSION INTELLIGENCE</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <button
            className={tab === "markets" ? "nav-active" : ""}
            onClick={() => setTab("markets")}
          >
            Market explorer
          </button>
          <button
            className={tab === "scenario" ? "nav-active" : ""}
            onClick={() => setTab("scenario")}
            disabled={!selected}
          >
            Launch simulator
          </button>
          <button onClick={() => setDrawer("methodology")}>
            Methodology <ArrowUpRight size={13} />
          </button>
        </nav>
        <span className="status-pill">
          <i className="dot amber" />
          {config?.versions.data_mode === "verified"
            ? "PUBLIC DATA SNAPSHOT"
            : "MOCK DATA · DEMO"}
        </span>
      </header>
      <main>
        <div className="eyebrow">
          <span className="tiny-line" /> PUBLIC SIGNALS. TRANSPARENT
          ASSUMPTIONS.
        </div>
        <div className="hero">
          <div>
            <h1>
              {tab === "markets" ? (
                <>
                  Where should you
                  <br />
                  <em>look next?</em>
                </>
              ) : (
                <>
                  Explore a launch.
                  <br />
                  <em>Test the assumptions.</em>
                </>
              )}
            </h1>
            <p>
              {tab === "markets"
                ? "Find the next market worth investigating. Compare environments, uncover opportunity, and model a hypothetical launch."
                : "A seven-day fleet scenario. Change capacity, demand, and fares. See what the assumptions produce."}
            </p>
          </div>
          <div className="hero-aside">
            <div className="coordinate">25°46′ N / 80°12′ W</div>
            <span>
              AN EARLY-STAGE LENS
              <br />
              FOR WHAT COMES NEXT
            </span>
            <Compass size={40} strokeWidth={1} />
          </div>
        </div>
        <div className="boundary">
          <ShieldCheck size={16} />
          <span>
            Public-data market screening and hypothetical fleet simulation.{" "}
            <strong>
              Not an assessment of AV safety or deployment approval.
            </strong>
          </span>
          <button onClick={() => setDrawer("methodology")}>
            Read the scope <ArrowRight size={14} />
          </button>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
            <Button variant="outline" onClick={() => setRetry((r) => r + 1)}>
              Retry connection
            </Button>
          </div>
        )}
        {fixtureMode && (
          <div className="notice">
            Fixture replay: fixed default assumptions. Switch to HTTP transport
            for interactive calculation.
          </div>
        )}
        {!cities || !config || !ranking ? (
          <div className="loading">
            <LoaderCircle className="spin" /> Connecting to market intelligence…
            <small>
              Backend:{" "}
              {process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"}
            </small>
          </div>
        ) : tab === "markets" ? (
          <>
            <section className="overview-strip">
              <div>
                <span>SCREENING UNIVERSE</span>
                <strong>
                  {cities.cities.length}
                  <small> candidate metros</small>
                </strong>
              </div>
              <div>
                <span>ENVIRONMENT REFERENCES</span>
                <strong>
                  {ranking.reference_ids.length}
                  <small> selected markets</small>
                </strong>
              </div>
              <div>
                <span>PUBLIC FEATURE MODEL</span>
                <strong>
                  {config.features.length}
                  <small> transparent variables</small>
                </strong>
              </div>
              <div className="snapshot-note">
                <Database size={18} />
                <span>
                  {config.versions.data_mode === "mock"
                    ? "Synthetic measurements. No verified rankings yet."
                    : "Versioned public evidence."}
                  <small>
                    {config.versions.data_version} /{" "}
                    {config.versions.model_version}
                  </small>
                </span>
              </div>
            </section>
            <div className="explorer-grid">
              <section className="panel map-panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">01 / MARKET LANDSCAPE</span>
                    <h2>Opportunity, in perspective.</h2>
                  </div>
                  <span className="micro-tag">U.S. METROS</span>
                </div>
                <MarketMap
                  cities={cities.cities}
                  ranking={ranking}
                  selected={selected}
                  onSelect={setSelected}
                />
                <div className="map-bottom">
                  <span>
                    <i className="dot teal" /> {ranking.ranked.length} ranked ·{" "}
                    {ranking.unranked.length} unranked
                  </span>
                  <span>Scores relative to this release</span>
                </div>
              </section>
              <section className="panel ranking-panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">THE SHORTLIST</span>
                    <h2>Candidate markets</h2>
                  </div>
                  {busy ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <Layers3 size={19} />
                  )}
                </div>
                <label className="search-label">
                  <span className="sr-only">Find a metro</span>
                  <input
                    placeholder="Find a metro…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <span>⌕</span>
                </label>
                <div className="ranking-columns">
                  <span>METRO / RANK</span>
                  <span>SCREENING SCORE</span>
                </div>
                <div className="ranking-list" aria-busy={busy}>
                  {visible.map((r) => (
                    <button
                      className={`ranking-row ${selected === r.city_id ? "selected" : ""}`}
                      key={r.city_id}
                      onClick={() => setSelected(r.city_id)}
                    >
                      <span
                        className={`rank-number ${(r.rank ?? 99) <= 3 ? "top-rank" : ""}`}
                      >
                        {r.rank ? String(r.rank).padStart(2, "0") : "—"}
                      </span>
                      <span className="city-label">
                        {
                          cities.cities.find((c) => c.city_id === r.city_id)
                            ?.display_name
                        }
                        <small>
                          {r.rank && r.rank <= 3
                            ? "TOP CANDIDATE"
                            : "METRO AREA"}
                        </small>
                      </span>
                      <strong>{r.expansion_score?.toFixed(1) ?? "N/A"}</strong>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                  {!visible.length && <p className="empty">No metros match.</p>}
                </div>
              </section>
            </div>
            <section className="panel weights-panel">
              <div>
                <SlidersHorizontal size={20} />
                <h3>
                  Your priorities.
                  <br />
                  <span>Your perspective.</span>
                </h3>
                <p>Adjust the balance. Rankings update.</p>
                <button
                  className="text-button"
                  onClick={() => setWeights(config.weights)}
                >
                  <RotateCcw size={12} /> Reset defaults
                </button>
              </div>
              <div className="weight-controls">
                {(Object.keys(pillarNames) as (keyof Weights)[]).map((key) => (
                  <label key={key}>
                    <span>
                      {pillarNames[key]}
                      <strong>
                        {(((weights[key] ?? 0) / total) * 100).toFixed(0)}%
                      </strong>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={weights[key] ?? 0}
                      disabled={fixtureMode}
                      onChange={(e) => adjust(key, Number(e.target.value))}
                    />
                    <small>
                      {key === "familiarity"
                        ? "Climate + commute similarity"
                        : key === "readiness"
                          ? "Public charging proxies only"
                          : "Population + mobility proxies"}
                    </small>
                  </label>
                ))}
              </div>
            </section>
            <section
              className="panel detail-panel"
              aria-label="Selected metro detail"
            >
              <div className="detail-title">
                <div>
                  <span className="eyebrow">02 / INSIDE THE MARKET</span>
                  <h2>
                    <MapPin size={22} />
                    {currentName}
                  </h2>
                  <p>{city?.official_name ?? "Loading metro evidence…"}</p>
                </div>
                <div className="score-badge">
                  <strong>{score?.expansion_score?.toFixed(1) ?? "—"}</strong>
                  <span>
                    EXPANSION
                    <br />
                    SCREENING SCORE
                  </span>
                </div>
              </div>
              <div className="detail-grid">
                <div className="pillar-bars">
                  {(Object.keys(pillarNames) as (keyof Weights)[]).map(
                    (key) => (
                      <div key={key}>
                        <span>
                          {pillarNames[key]}
                          <strong>
                            {score?.pillars[key]?.toFixed(1) ?? "—"}
                          </strong>
                        </span>
                        <div className={`bar-track ${key}`}>
                          <i
                            style={{ width: `${score?.pillars[key] ?? 0}%` }}
                          />
                        </div>
                        {key === "readiness" && (
                          <small>
                            Public infrastructure proxies; not technical
                            readiness
                          </small>
                        )}
                      </div>
                    ),
                  )}
                  <button
                    className="text-button"
                    onClick={() => setDrawer("sources")}
                  >
                    <Database size={14} /> Inspect features & sources{" "}
                    <ArrowUpRight size={13} />
                  </button>
                </div>
                <div className="analyst">
                  <span className="eyebrow">
                    <FlaskConical size={13} /> FACT-BASED ANALYST NOTE
                  </span>
                  <p>
                    {explanation?.summary ?? "Preparing the evidence summary…"}
                  </p>
                  {explanation?.advantages.map((a) => (
                    <div className="analyst-factor" key={a}>
                      <ArrowUpRight size={16} />
                      <span>{a}</span>
                    </div>
                  ))}
                  {explanation?.tradeoffs.slice(0, 1).map((t) => (
                    <div className="analyst-factor tradeoff" key={t}>
                      <ArrowDownRight size={16} />
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="detail-footer">
                <span>
                  Similarity describes selected public features. It does not
                  establish safe deployment.
                </span>
                <Button
                  onClick={() => {
                    setTab("scenario");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Simulate hypothetical launch <ArrowRight size={16} />
                </Button>
              </div>
            </section>
          </>
        ) : (
          <Scenario
            cityId={selected}
            cityName={currentName}
            onBack={() => setTab("markets")}
          />
        )}
        <footer>
          <span className="footer-logo">ODD SCOUT</span>
          <span>Public evidence. Explicit assumptions. Better questions.</span>
          <button onClick={() => setDrawer("methodology")}>
            Scope & methodology <ExternalLink size={12} />
          </button>
        </footer>
      </main>
      <dialog
        ref={drawerRef}
        className="drawer"
        onCancel={() => setDrawer(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setDrawer(null);
        }}
      >
        <div className="drawer-content">
          <div className="section-heading">
            <span className="eyebrow">
              {drawer === "sources" ? "EVIDENCE REGISTER" : "MODEL NOTES"}
            </span>
            <Button
              variant="ghost"
              aria-label="Close details"
              onClick={() => setDrawer(null)}
            >
              <X size={20} />
            </Button>
          </div>
          <h2>
            {drawer === "sources"
              ? `${currentName}: behind the score`
              : "A screening tool. A starting point."}
          </h2>
          {drawer === "sources" ? (
            <>
              <p>
                Release: {city?.versions.data_version}. Data mode:{" "}
                <strong>{city?.versions.data_mode}</strong>. Geographic vintage:{" "}
                {city?.geography_vintage}.
              </p>
              {config?.features.map((f) => {
                const value = city?.features[f.key];
                const factor = score?.factors.find((x) => x.feature === f.key);
                return (
                  <article className="source-feature" key={f.key}>
                    <div>
                      <h3>{f.label}</h3>
                      <strong>
                        {value?.value?.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        }) ?? "Missing"}{" "}
                        <small>{f.unit}</small>
                      </strong>
                    </div>
                    <p>{f.definition}</p>
                    <small>
                      {value?.quality} ·{" "}
                      {factor?.distance_component != null
                        ? `Distance component: ${factor.distance_component.toFixed(4)}`
                        : `Pillar points: ${factor?.score_points?.toFixed(2) ?? "unavailable"}`}{" "}
                      · Evidence: {value?.provenance_ids.join(", ")}
                    </small>
                  </article>
                );
              })}
              <h3>Source provenance</h3>
              {city?.provenance.map((p) => (
                <article className="source-feature" key={p.id}>
                  <h3>{p.source_name}</h3>
                  <p>{p.transformation}</p>
                  <p>
                    {p.period} · {p.source_geography} / {p.target_geography}
                  </p>
                  {p.source_url.startsWith("https://") ? (
                    <a href={p.source_url} target="_blank" rel="noreferrer">
                      Source document <ExternalLink size={12} />
                    </a>
                  ) : (
                    <code>{p.source_url}</code>
                  )}
                  <small>
                    Retrieved {p.retrieved_at} · SHA-256 {p.raw_sha256}
                  </small>
                  {p.assumptions.map((a) => (
                    <p key={a}>{a}</p>
                  ))}
                </article>
              ))}
              <h3>Nearest reference environments</h3>
              <p>
                Similarity across selected features only. Reference status does
                not establish metro-wide operation.
              </p>
              {score?.reference_matches.map((match) => {
                const ref = config?.references.find(
                  (r) => r.id === match.reference_id,
                );
                const details = referenceCities.find(
                  (c) => c.city_id === ref?.city_id,
                );
                return (
                  <article className="source-feature" key={match.reference_id}>
                    <h3>
                      {details?.display_name ?? "Loading reference…"} ·{" "}
                      {match.similarity.toFixed(1)} similarity
                    </h3>
                    <p>
                      {ref?.operator} · {ref?.category} · as of{" "}
                      {ref?.status_as_of}
                    </p>
                    {details?.provenance
                      .filter((p) => ref?.provenance_ids.includes(p.id))
                      .map((p) => (
                        <p key={p.id}>
                          {p.source_url.startsWith("https://") ? (
                            <a
                              href={p.source_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {p.source_name} <ExternalLink size={12} />
                            </a>
                          ) : (
                            p.source_name
                          )}{" "}
                          · {p.transformation}
                        </p>
                      ))}
                  </article>
                );
              })}
              <h3>Regulatory evidence</h3>
              {city?.legal_evidence.map((e) => (
                <p key={e.jurisdiction}>
                  {e.jurisdiction}: {e.summary}
                </p>
              ))}
            </>
          ) : (
            <>
              <p>
                ODD Scout compares selected public environmental features and
                explores hypothetical fleet operations. It does not reproduce
                Waymo’s internal systems or scoring weights.
              </p>
              <h3>Three transparent pillars</h3>
              <p>
                ODD familiarity uses weighted Euclidean distance to the nearest
                complete reference environment. P0 covers climate and commuting
                proxies only.
              </p>
              <p>
                Deployment readiness reflects public charging quantity and
                coarse geographic spread. These do not establish secured depot
                capacity.
              </p>
              <p>
                Market opportunity uses population, density, zero-vehicle
                households, and transit commuting. None is measured ride-hailing
                demand.
              </p>
              <h3>Release-based comparisons</h3>
              <p>
                Normalization is frozen across candidate and reference metros.
                Scores are relative indices, not probabilities. Missing enabled
                features leave a metro unranked. Legal evidence stays outside
                numeric scoring.
              </p>
              <h3>Deployment still requires</h3>
              <p>
                Mapping, real-world driving, validation, safety testing,
                regulatory approval, and operational testing.
              </p>
              <h3>Hypothetical operations</h3>
              <p>
                Simulation uses a synthetic service zone, assumed demand and
                private depot capacity. No perception, vehicle physics, street
                routing, or safety testing. Gross revenue is not profit.
              </p>
              <a
                href="https://waymo.com/blog/2020/10/sharing-our-safety-framework"
                target="_blank"
                rel="noreferrer"
              >
                Public methodology context <ExternalLink size={14} />
              </a>
              {config?.exclusions.map((e) => (
                <p className="notice" key={e}>
                  {e}
                </p>
              ))}
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
