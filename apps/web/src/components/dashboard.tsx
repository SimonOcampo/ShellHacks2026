"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Compass,
  Database,
  ExternalLink,
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
import Landing from "./landing";
import EvidenceAssistant from "./evidence-assistant";
import { MarketMapbox } from "./mapbox-map";
import Scenario from "./scenario";

const pillarNames = {
  familiarity: "ODD familiarity",
  readiness: "Deployment readiness — public infrastructure proxies",
  opportunity: "Market opportunity",
};
const provenanceAnchor = (id: string) =>
  `provenance-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
const initialWeights: Weights = {
  familiarity: 0.4,
  readiness: 0.2,
  opportunity: 0.4,
};
type ReferenceCategory = Config["references"][number]["category"];
const referenceCategories: ReferenceCategory[] = [
  "commercial",
  "announced",
  "testing",
];
export default function Dashboard() {
  const [cities, setCities] = useState<CityList>();
  const [config, setConfig] = useState<Config>();
  const [ranking, setRanking] = useState<Ranking>();
  const [weights, setWeights] = useState<Weights>(initialWeights);
  const [selectedCategories, setSelectedCategories] = useState<ReferenceCategory[]>([
    "commercial",
  ]);
  const [selected, setSelected] = useState("");
  const [city, setCity] = useState<City>();
  const [explanation, setExplanation] = useState<Explanation>();
  const [referenceCities, setReferenceCities] = useState<City[]>([]);
  const [error, setError] = useState("");
  const [rankingError, setRankingError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailRetry, setDetailRetry] = useState(0);
  const [referenceError, setReferenceError] = useState("");
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [referenceRetry, setReferenceRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [drawer, setDrawer] = useState<"methodology" | "sources" | null>(null);
  const [tab, setTab] = useState<"home" | "markets" | "scenario">("home");
  const [mapFocusVersion, setMapFocusVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [focusEvidenceId, setFocusEvidenceId] = useState<string | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const drawerRef = useRef<HTMLDialogElement>(null);
  const rankingListRef = useRef<HTMLDivElement>(null);
  const selectCity = useCallback((cityId: string) => {
    setSelected(cityId);
    setMapFocusVersion((version) => version + 1);
  }, []);
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
        const available = referenceCategories.filter((category) =>
          f.references.some((reference) => reference.enabled && reference.category === category),
        );
        setSelectedCategories(
          available.includes("commercial") ? ["commercial"] : available.slice(0, 1),
        );
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
    setRankingError("");
    const timer = setTimeout(
      () =>
        api
          .rank(
            {
              weights,
              reference_categories: selectedCategories,
              compare_weights: config.weights,
            },
            controller.signal,
          )
          .then((r) => {
            if (controller.signal.aborted) return;
            setRanking(r);
            setRankingError("");
            if (!selectedRef.current)
              setSelected(r.ranked[0]?.city_id ?? r.unranked[0]?.city_id ?? "");
          })
          .catch((e) => {
            if (!controller.signal.aborted) setRankingError(e.message);
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
  }, [weights, selectedCategories, config, retry]);
  useEffect(() => {
    if (!selected || !ranking) return;
    const controller = new AbortController();
    setDetailBusy(true);
    setDetailError("");
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
        if (!controller.signal.aborted) setDetailError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailBusy(false);
      });
    return () => controller.abort();
  }, [selected, ranking, detailRetry]);
  const score =
    ranking &&
    [...ranking.ranked, ...ranking.unranked].find(
      (r) => r.city_id === selected,
    );
  const sensitivity = ranking?.weight_sensitivity?.changes.find(
    (change) => change.city_id === selected,
  );
  const availableCategories = referenceCategories.filter((category) =>
    config?.references.some((reference) => reference.enabled && reference.category === category),
  );
  const currentName =
    cities?.cities.find((c) => c.city_id === selected)?.display_name ??
    "Select a market";
  useEffect(() => {
    if (drawer !== "sources" || !score || !config) return;
    const controller = new AbortController();
    setReferenceCities([]);
    setReferenceError("");
    setReferenceBusy(true);
    const ids = score.reference_matches
      .map(
        (match) =>
          config.references.find((r) => r.id === match.reference_id)?.city_id,
      )
      .filter((id): id is string => !!id);
    if (ids.length === 0) {
      setReferenceBusy(false);
      return () => controller.abort();
    }
    Promise.all(ids.map((id) => api.city(id, controller.signal)))
      .then((values) => {
        if (!controller.signal.aborted) setReferenceCities(values);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setReferenceError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setReferenceBusy(false);
      });
    return () => controller.abort();
  }, [drawer, score, config, referenceRetry]);
  useEffect(() => {
    if (drawer !== "sources" || !focusEvidenceId) return;
    document
      .getElementById(provenanceAnchor(focusEvidenceId))
      ?.scrollIntoView({ block: "center" });
  }, [drawer, focusEvidenceId, city, referenceCities]);
  const visible = [
    ...(ranking?.ranked ?? []),
    ...(ranking?.unranked ?? []),
  ].filter((r) =>
    cities?.cities
      .find((c) => c.city_id === r.city_id)
      ?.display_name.toLowerCase()
      .includes(search.toLowerCase()),
  );
  useEffect(() => {
    const list = rankingListRef.current;
    if (!list || !selected) return;
    const item = Array.from(
      list.querySelectorAll<HTMLElement>("[data-city-id]"),
    ).find((candidate) => candidate.dataset.cityId === selected);
    if (!item) return;
    const listBounds = list.getBoundingClientRect();
    const itemBounds = item.getBoundingClientRect();
    if (itemBounds.top < listBounds.top)
      list.scrollTop -= listBounds.top - itemBounds.top;
    else if (itemBounds.bottom > listBounds.bottom)
      list.scrollTop += itemBounds.bottom - listBounds.bottom;
  }, [selected, visible.length]);
  function adjust(key: keyof Weights, value: number) {
    const next = { ...weights, [key]: value };
    if (Object.values(next).reduce<number>((a, b) => a + (b ?? 0), 0) > 0)
      setWeights(next);
  }
  function toggleCategory(category: ReferenceCategory) {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.length > 1
          ? current.filter((item) => item !== category)
          : current
        : [...current, category],
    );
  }
  function openEvidence(id: string) {
    setFocusEvidenceId(id);
    setDrawer("sources");
  }
  return (
    <>
      <header className="topbar">
        <button
          className="brand"
          type="button"
          onClick={() => setTab("home")}
          aria-label="ODD Scout home"
        >
          <div className="brand-symbol">
            <Radar size={25} />
          </div>
          <span>
            ODD<span className="brand-light">SCOUT</span>
            <small>EXPANSION INTELLIGENCE</small>
          </span>
        </button>
        <nav aria-label="Main navigation">
          <button
            className={tab === "home" ? "nav-active" : ""}
            aria-pressed={tab === "home"}
            onClick={() => setTab("home")}
          >
            Home
          </button>
          <button
            className={tab === "markets" ? "nav-active" : ""}
            aria-pressed={tab === "markets"}
            onClick={() => setTab("markets")}
          >
            Market explorer
          </button>
          <button
            className={tab === "scenario" ? "nav-active" : ""}
            aria-pressed={tab === "scenario"}
            onClick={() => setTab("scenario")}
            disabled={!selected}
          >
            Fleet simulator
          </button>
          <button onClick={() => setDrawer("methodology")}>
            Methodology <ArrowUpRight size={13} />
          </button>
        </nav>
        <span className="status-pill">
          <i className={`dot ${config?.versions.data_mode === "verified" ? "teal" : "amber"}`} />
          {!config
            ? "DATA MODE LOADING"
            : config.versions.data_mode === "verified"
              ? "PUBLIC DATA SNAPSHOT"
              : "MOCK DATA · DEMO"}
        </span>
      </header>
      {tab === "home" && (
        <Landing
          candidateCount={cities?.cities.length}
          dataMode={config?.versions.data_mode}
          canSimulate={Boolean(selected)}
          onExplore={() => setTab("markets")}
          onSimulate={() => setTab("scenario")}
        />
      )}
      <main hidden={tab === "home"}>
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
          error || rankingError ? (
            <div className="empty async-empty" role="status">
              {error ? (
                "Market data is unavailable. Retry the connection above to try again."
              ) : (
                <>
                  <span>Ranking is unavailable: {rankingError}</span>
                  <Button
                    variant="outline"
                    onClick={() => setRetry((value) => value + 1)}
                  >
                    Retry ranking
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="loading" role="status" aria-live="polite">
              <LoaderCircle className="spin" aria-hidden="true" /> Connecting to
              market intelligence…
              <small>
                Backend:{" "}
                {process.env.NEXT_PUBLIC_API_BASE_URL ??
                  "http://localhost:8000"}
              </small>
            </div>
          )
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
            <div className="explorer-grid map-priority-grid">
              <section className="panel ranking-panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">THE SHORTLIST</span>
                    <h2>Candidate markets</h2>
                  </div>
                  {busy ? (
                    <span
                      className="ranking-updating"
                      role="status"
                      aria-live="polite"
                    >
                      <LoaderCircle
                        size={15}
                        className="spin"
                        aria-hidden="true"
                      />
                      Updating…
                    </span>
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
                {rankingError && (
                  <div className="error view-error" role="alert">
                    Ranking update failed: {rankingError}. Showing the last
                    successful ranking.
                    <Button
                      variant="outline"
                      onClick={() => setRetry((r) => r + 1)}
                    >
                      Retry ranking
                    </Button>
                  </div>
                )}
                <div className="ranking-columns">
                  <span>METRO / RANK</span>
                  <span>SCREENING SCORE</span>
                </div>
                <div
                  ref={rankingListRef}
                  className={`ranking-list ${busy ? "is-updating" : ""}`}
                  aria-busy={busy}
                >
                  {visible.map((r) => {
                    const expanded = selected === r.city_id;
                    const name = cities.cities.find((c) => c.city_id === r.city_id)?.display_name ?? r.city_id;
                    const breakdownId = `ranking-breakdown-${r.city_id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                    return (
                      <article className="ranking-item" key={r.city_id} data-city-id={r.city_id}>
                        <button
                          className={`ranking-row ${expanded ? "selected" : ""}`}
                          aria-expanded={expanded}
                          aria-controls={expanded ? breakdownId : undefined}
                          onClick={() => selectCity(r.city_id)}
                        >
                          <span className={`rank-number ${(r.rank ?? 99) <= 3 ? "top-rank" : ""}`}>
                            {r.rank ? String(r.rank).padStart(2, "0") : "—"}
                          </span>
                          <span className="city-label">
                            {name}
                            <small>{r.rank && r.rank <= 3 ? "TOP CANDIDATE" : "METRO AREA"}</small>
                          </span>
                          <strong>{r.expansion_score?.toFixed(1) ?? "N/A"}</strong>
                          <ChevronRight size={14} />
                        </button>
                        {expanded && (
                          <div className="ranking-expanded" id={breakdownId}>
                            <span className="expanded-title">PILLAR BREAKDOWN</span>
                            {(Object.keys(pillarNames) as (keyof Weights)[]).map((key) => (
                              <div className="expanded-pillar" key={key}>
                                <span>{key === "readiness" ? "Infrastructure proxies" : pillarNames[key]}</span>
                                <strong>{r.pillars[key]?.toFixed(1) ?? "—"}</strong>
                              </div>
                            ))}
                            <button
                              type="button"
                              className="expanded-detail-link"
                              onClick={() =>
                                document
                                  .getElementById("city-detail")
                                  ?.scrollIntoView({
                                    behavior: window.matchMedia(
                                      "(prefers-reduced-motion: reduce)",
                                    ).matches
                                      ? "auto"
                                      : "smooth",
                                  })
                              }
                            >
                              Full factors and evidence <ArrowUpRight size={12} />
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {!visible.length && (
                    <p className="empty" role="status">
                      {ranking.ranked.length + ranking.unranked.length === 0
                        ? "This release returned no ranked or unranked metros."
                        : "No metros match this search."}
                    </p>
                  )}
                </div>
              </section>
              <section className="panel map-panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">01 / MARKET LANDSCAPE</span>
                    <h2>{selected ? currentName : "Opportunity, in perspective."}</h2>
                  </div>
                  <span className="micro-tag">MAPBOX · U.S. METROS</span>
                </div>
                <MarketMapbox
                  cities={cities.cities}
                  ranking={ranking}
                  selected={selected}
                  focusVersion={mapFocusVersion}
                  onSelect={selectCity}
                />
                <div className="map-bottom">
                  <span>
                    <i className="dot teal" /> {ranking.ranked.length} ranked ·{" "}
                    {ranking.unranked.length} unranked
                  </span>
                  <span>Markers show metro centers, not service boundaries</span>
                </div>
              </section>
              <EvidenceAssistant
                cityName={currentName}
                score={score}
                explanation={explanation}
                loading={detailBusy}
                error={detailError}
                onEvidenceClick={openEvidence}
              />
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
                        {((ranking.normalized_weights[key] ?? 0) * 100).toFixed(
                          0,
                        )}
                        %
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
              <div className="ranking-comparison">
                <fieldset disabled={fixtureMode || busy}>
                  <legend>Reference categories</legend>
                  {availableCategories.map((category) => (
                    <label key={category}>
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(category)}
                        disabled={selectedCategories.length === 1 && selectedCategories.includes(category)}
                        onChange={() => toggleCategory(category)}
                      />
                      {category}
                    </label>
                  ))}
                  {availableCategories.length === 1 && (
                    <p>Only category available in this release.</p>
                  )}
                </fieldset>
                <div aria-live="polite">
                  <strong>Weight sensitivity · {currentName}</strong>
                  {fixtureMode ? (
                    <p>Fixture replay shows default ranking only. Use live API for comparisons.</p>
                  ) : busy ? (
                    <p>Updating comparison…</p>
                  ) : sensitivity && score?.rank ? (
                    <p>
                      Default weights: #{sensitivity.baseline_rank}, {sensitivity.baseline_score.toFixed(1)}.
                      Current weights: #{score.rank}, {score.expansion_score?.toFixed(1)}.
                      Rank change: {sensitivity.rank_change > 0 ? "+" : ""}{sensitivity.rank_change};
                      score change: {sensitivity.score_change > 0 ? "+" : ""}{sensitivity.score_change.toFixed(1)}.
                    </p>
                  ) : (
                    <p>No weight comparison for this metro.</p>
                  )}
                </div>
              </div>
            </section>
            <section
              className="panel detail-panel"
              id="city-detail"
              aria-label="Selected metro detail"
            >
              <div className="detail-title">
                <div>
                  <span className="eyebrow">02 / INSIDE THE MARKET</span>
                  <h2>
                    <MapPin size={22} />
                    {currentName}
                  </h2>
                  <p>
                    {city?.official_name ??
                      (detailBusy
                        ? "Loading metro evidence…"
                        : detailError
                          ? "Metro evidence unavailable."
                          : "No metro details returned.")}
                  </p>
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
              {detailError && (
                <div className="error view-error" role="alert">
                  Metro evidence could not load: {detailError}
                  <Button
                    variant="outline"
                    onClick={() => setDetailRetry((value) => value + 1)}
                  >
                    Retry metro detail
                  </Button>
                </div>
              )}
              <section
                className="coverage-summary"
                aria-label="Ranking coverage and flags"
              >
                <div>
                  <span>Configured feature coverage</span>
                  <strong>
                    {score
                      ? `${(score.coverage * 100).toFixed(0)}%`
                      : "Unavailable"}
                  </strong>
                </div>
                <div>
                  <span>Ranking exclusions</span>
                  {score?.exclusion_reasons.length ? (
                    <ul>
                      {score.exclusion_reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      {score ? "No exclusion reasons reported." : "Unavailable"}
                    </p>
                  )}
                </div>
                <div>
                  <span>Legal flags · outside numeric score</span>
                  {score?.legal_flags.length ? (
                    <ul>
                      {score.legal_flags.map((flag) => (
                        <li key={flag}>{flag}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{score ? "No legal flags reported." : "Unavailable"}</p>
                  )}
                </div>
              </section>
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
              </div>
              <div className="detail-footer">
                <span>
                  Similarity describes selected public features. It does not
                  establish safe deployment.
                </span>
                <Button
                  onClick={() => {
                    setTab("scenario");
                    window.scrollTo({
                      top: 0,
                      behavior: window.matchMedia(
                        "(prefers-reduced-motion: reduce)",
                      ).matches
                        ? "auto"
                        : "smooth",
                    });
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
            latitude={cities?.cities.find((c) => c.city_id === selected)?.latitude ?? 39.5}
            longitude={cities?.cities.find((c) => c.city_id === selected)?.longitude ?? -98.5}
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
              {detailBusy && (
                <p role="status" aria-live="polite">
                  Loading selected metro evidence…
                </p>
              )}
              {detailError && (
                <div className="error view-error" role="alert">
                  Metro evidence could not load: {detailError}
                  <Button
                    variant="outline"
                    onClick={() => setDetailRetry((value) => value + 1)}
                  >
                    Retry metro detail
                  </Button>
                </div>
              )}
              {!city && !detailBusy && !detailError && (
                <p className="empty">
                  No metro detail record was returned for this selection.
                </p>
              )}
              {city &&
                config?.features.map((f) => {
                  const value = city?.features[f.key];
                  const factor = score?.factors.find(
                    (x) => x.feature === f.key,
                  );
                  return (
                    <article className="source-feature" key={f.key}>
                      <div>
                        <h3>{f.label}</h3>
                        <strong>
                          Raw:{" "}
                          {value?.value?.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          }) ?? "Missing"}{" "}
                          <small>{value?.unit ?? f.unit}</small>
                        </strong>
                      </div>
                      <p>{f.definition}</p>
                      <small>
                        Quality: {value?.quality ?? "missing"} · Normalized
                        value:{" "}
                        {factor?.normalized_value == null
                          ? "unavailable"
                          : factor.normalized_value.toFixed(3)}
                        {factor?.reference_value == null
                          ? ""
                          : ` · Reference value: ${factor.reference_value.toFixed(3)}`}
                      </small>
                      <small>
                        {factor?.distance_component != null ? (
                          <>
                            Distance component:{" "}
                            {factor.distance_component.toFixed(4)}
                          </>
                        ) : (
                          <>
                            Pillar points:{" "}
                            {factor?.score_points?.toFixed(2) ?? "unavailable"}
                          </>
                        )}
                      </small>
                      {value?.missing_reason && (
                        <small>Missing reason: {value.missing_reason}</small>
                      )}
                      <small>
                        Evidence:{" "}
                        {value?.provenance_ids.length
                          ? value.provenance_ids.map((id, index) => (
                              <span key={id}>
                                {index > 0 ? ", " : ""}
                                <button
                                  className="evidence-link"
                                  type="button"
                                  onClick={() => openEvidence(id)}
                                >
                                  {id}
                                </button>
                              </span>
                            ))
                          : "unavailable"}
                      </small>
                    </article>
                  );
                })}
              <h3>Source provenance</h3>
              {city?.provenance.length ? (
                city.provenance.map((p) => (
                  <article
                    className="source-feature"
                    id={provenanceAnchor(p.id)}
                    key={p.id}
                  >
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
                ))
              ) : (
                <p className="empty">
                  No source provenance records were returned for this metro.
                </p>
              )}
              <h3>Nearest reference environments</h3>
              <p>
                Similarity across selected features only. Reference status does
                not establish metro-wide operation.
              </p>
              {referenceBusy && (
                <p role="status" aria-live="polite">
                  Loading reference metro provenance…
                </p>
              )}
              {referenceError && (
                <div className="error view-error" role="alert">
                  Reference provenance could not load: {referenceError}
                  <Button
                    variant="outline"
                    onClick={() => setReferenceRetry((value) => value + 1)}
                  >
                    Retry reference details
                  </Button>
                </div>
              )}
              {!referenceBusy &&
                !referenceError &&
                !score?.reference_matches.length && (
                  <p className="empty">No reference matches were returned.</p>
                )}
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
                      {details?.display_name ??
                        (referenceBusy
                          ? "Loading reference…"
                          : "Reference detail unavailable")}{" "}
                      · {match.similarity.toFixed(1)} similarity
                    </h3>
                    <p>
                      {ref?.operator} · {ref?.category} · as of{" "}
                      {ref?.status_as_of}
                    </p>
                    {details?.provenance
                      .filter((p) => ref?.provenance_ids.includes(p.id))
                      .map((p) => (
                        <p id={provenanceAnchor(p.id)} key={p.id}>
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
                          · {p.transformation} · Retrieved {p.retrieved_at}
                          {" · "}SHA-256 {p.raw_sha256}
                        </p>
                      ))}
                  </article>
                );
              })}
              <h3>Regulatory evidence</h3>
              {city?.legal_evidence.length ? (
                city.legal_evidence.map((e) => (
                  <article
                    className="source-feature"
                    key={`${e.jurisdiction}-${e.category}`}
                  >
                    <h3>
                      {e.jurisdiction} · {e.category.replaceAll("_", " ")}
                    </h3>
                    <p>{e.summary}</p>
                    <small>Checked {e.checked_at}</small>
                    {e.provenance_ids.map((id) => (
                      <button
                        className="evidence-link"
                        key={id}
                        type="button"
                        onClick={() => openEvidence(id)}
                      >
                        Evidence: {id}
                      </button>
                    ))}
                  </article>
                ))
              ) : (
                <p className="empty">
                  No regulatory evidence records were returned. This does not
                  establish a legal status.
                </p>
              )}
            </>
          ) : (
            <>
              <p>
                Scores reflect selected public features and transparent modeling
                assumptions. Actual deployment requires mapping, real-world
                driving, validation, safety testing, regulatory approval, and
                operational testing. ODD Scout does not reproduce Waymo's
                internal systems or scoring weights.
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
