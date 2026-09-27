"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Database,
  Layers3,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { api, fixtureMode } from "@/lib/api/client";
import type {
  City,
  CityList,
  Config,
  DataRelease,
  Explanation,
  Ranking,
  Weights,
} from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import Landing from "./landing";
import EvidenceAssistant from "./evidence-assistant";
import { MarketMapbox } from "./mapbox-map";
import Scenario from "./scenario";
import { citySkyline } from "@/lib/city-photos";

const pillarNames = {
  familiarity: "ODD familiarity",
  readiness: "Infrastructure",
  opportunity: "Opportunity",
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
const waymoReferenceCategories: ReferenceCategory[] = ["commercial"];
const featuredReferenceIds = ["cbsa:41860", "cbsa:33100", "cbsa:12060"];
const featuredReferenceNames: Record<string, string> = {
  "cbsa:41860": "San Francisco Bay Area, California",
  "cbsa:33100": "Miami, Florida",
  "cbsa:12060": "Atlanta, Georgia",
};
type DashboardTab = "home" | "markets" | "waymo" | "scenario";
export default function Dashboard() {
  const [cities, setCities] = useState<CityList>();
  const [config, setConfig] = useState<Config>();
  const [ranking, setRanking] = useState<Ranking>();
  const [referenceRanking, setReferenceRanking] = useState<Ranking>();
  const [waymoRelease, setWaymoRelease] = useState<DataRelease>();
  const [waymoRanking, setWaymoRanking] = useState<Ranking>();
  const [waymoDataRetry, setWaymoDataRetry] = useState(0);
  const [waymoWeights, setWaymoWeights] = useState<Weights>(initialWeights);
  const [waymoSelected, setWaymoSelected] = useState("");
  const [waymoExplanation, setWaymoExplanation] = useState<Explanation>();
  const [waymoBusy, setWaymoBusy] = useState(false);
  const [waymoError, setWaymoError] = useState("");
  const [waymoRankingError, setWaymoRankingError] = useState("");
  const [waymoRetry, setWaymoRetry] = useState(0);
  const [waymoDetailBusy, setWaymoDetailBusy] = useState(false);
  const [waymoDetailError, setWaymoDetailError] = useState("");
  const [waymoDetailRetry, setWaymoDetailRetry] = useState(0);
  const [scenarioOrigin, setScenarioOrigin] = useState<"markets" | "waymo">(
    "markets",
  );
  const [featuredBusy, setFeaturedBusy] = useState(false);
  const [featuredError, setFeaturedError] = useState("");
  const [weights, setWeights] = useState<Weights>(initialWeights);
  const [selectedCategories, setSelectedCategories] = useState<
    ReferenceCategory[]
  >(["commercial"]);
  const [selected, setSelected] = useState("");
  const [city, setCity] = useState<City>();
  const [explanation, setExplanation] = useState<Explanation>();
  const [error, setError] = useState("");
  const [rankingError, setRankingError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailRetry, setDetailRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState<DashboardTab>("home");
  const isWaymoPage = tab === "waymo";
  const usesWaymoData =
    isWaymoPage || (tab === "scenario" && scenarioOrigin === "waymo");
  const [mapFocusVersion, setMapFocusVersion] = useState(0);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const rankingListRef = useRef<HTMLDivElement>(null);
  const selectCity = useCallback((cityId: string) => {
    if (tab === "waymo") setWaymoSelected(cityId);
    else setSelected(cityId);
    setMapFocusVersion((version) => version + 1);
  }, [tab]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    Promise.all([api.cities(controller.signal), api.config(controller.signal)])
      .then(([c, f]) => {
        setCities(c);
        setConfig(f);
        setWeights(f.weights);
        const available = referenceCategories.filter((category) =>
          f.references.some(
            (reference) => reference.enabled && reference.category === category,
          ),
        );
        setSelectedCategories(
          available.includes("commercial")
            ? ["commercial"]
            : available.slice(0, 1),
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const controller = new AbortController();
    setWaymoError("");
    Promise.all([
      api.waymoReferenceRelease(controller.signal),
      api.waymoReferenceRanking(controller.signal),
    ])
      .then(([release, result]) => {
        if (controller.signal.aborted) return;
        setWaymoRelease(release);
        setWaymoRanking(result);
        setWaymoError("");
        setWaymoWeights(result.normalized_weights);
        setWaymoSelected(
          (current) =>
            current ||
            result.ranked[0]?.city_id ||
            release.references.find(
              (reference) =>
                reference.enabled && reference.operator === "Waymo",
            )?.city_id ||
            "",
        );
      })
      .catch((loadError) => {
        if (!controller.signal.aborted)
          setWaymoError(loadError.message ?? "Reference markets unavailable.");
      });
    return () => controller.abort();
  }, [waymoDataRetry]);
  useEffect(() => {
    if (!config || usesWaymoData) return;
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
  }, [weights, selectedCategories, config, retry, tab, usesWaymoData]);
  useEffect(() => {
    if (tab !== "waymo" || !waymoRelease || fixtureMode) return;
    const controller = new AbortController();
    const cityIds = waymoRelease.references
      .filter((reference) => reference.enabled && reference.operator === "Waymo")
      .map((reference) => reference.city_id);
    setWaymoBusy(true);
    setWaymoRankingError("");
    api
      .rankWaymoReferences(
        {
          city_ids: cityIds,
          weights: waymoWeights,
          reference_categories: waymoReferenceCategories,
          compare_weights: initialWeights,
        },
        controller.signal,
      )
      .then((result) => {
        if (controller.signal.aborted) return;
        setWaymoRanking(result);
        setWaymoRankingError("");
        setWaymoSelected((current) =>
          cityIds.includes(current)
            ? current
            : result.ranked[0]?.city_id ?? cityIds[0] ?? "",
        );
      })
      .catch((rankError) => {
        if (!controller.signal.aborted)
          setWaymoRankingError(rankError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setWaymoBusy(false);
      });
    return () => controller.abort();
  }, [tab, waymoRelease, waymoWeights, waymoRetry]);
  useEffect(() => {
    if (config?.versions.data_mode !== "verified" || usesWaymoData) {
      setReferenceRanking(undefined);
      return;
    }
    const controller = new AbortController();
    setFeaturedBusy(true);
    setFeaturedError("");
    const timer = setTimeout(() => {
      api.referenceRank(
        {
          city_ids: featuredReferenceIds,
          weights,
          reference_categories: selectedCategories,
        },
        controller.signal,
      )
        .then((result) => {
          if (!controller.signal.aborted) setReferenceRanking(result);
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setReferenceRanking(undefined);
            setFeaturedError(error.message);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setFeaturedBusy(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [weights, selectedCategories, config, tab, usesWaymoData]);
  useEffect(() => {
    if (usesWaymoData || !selected || !ranking) return;
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
  }, [selected, ranking, detailRetry, tab, usesWaymoData]);
  useEffect(() => {
    if (tab !== "waymo" || !waymoRelease || !waymoRanking || !waymoSelected)
      return;
    const controller = new AbortController();
    const cityIds = waymoRelease.references
      .filter((reference) => reference.enabled && reference.operator === "Waymo")
      .map((reference) => reference.city_id);
    setWaymoDetailBusy(true);
    setWaymoDetailError("");
    api
      .explainWaymoReference(
        waymoSelected,
        {
          city_ids: cityIds,
          weights: waymoRanking.normalized_weights,
          reference_categories: waymoReferenceCategories,
        },
        controller.signal,
      )
      .then((result) => {
        if (!controller.signal.aborted) setWaymoExplanation(result);
      })
      .catch((detailError) => {
        if (!controller.signal.aborted)
          setWaymoDetailError(detailError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setWaymoDetailBusy(false);
      });
    return () => controller.abort();
  }, [
    tab,
    waymoRelease,
    waymoRanking,
    waymoSelected,
    waymoDetailRetry,
  ]);
  const currentName =
    cities?.cities.find((c) => c.city_id === selected)?.display_name ??
    "Select a market";
  const featuredScores = referenceRanking
    ? [...referenceRanking.ranked, ...referenceRanking.unranked]
    : [];
  const featuredMarkets = (featuredScores.length
    ? featuredScores
    : featuredReferenceIds.map((city_id) => ({
        city_id,
        rank: null,
        expansion_score: null,
        pillars: { familiarity: null, readiness: null, opportunity: null },
      })))
    .map((market) => ({
      id: market.city_id,
      name: featuredReferenceNames[market.city_id] ?? market.city_id,
      score: market.expansion_score,
      rank: market.rank,
      pillars: market.pillars,
    }));
  const workflowMarkets = (ranking?.ranked ?? []).slice(0, 3).map((market) => ({
    id: market.city_id,
    name:
      cities?.cities.find((city) => city.city_id === market.city_id)
        ?.display_name ?? market.city_id,
    score: market.expansion_score,
    rank: market.rank,
  }));
  const waymoCityList: CityList | undefined = waymoRelease
    ? {
        versions: waymoRelease.versions,
        cities: waymoRelease.references
          .filter(
            (reference) =>
              reference.enabled && reference.operator === "Waymo",
          )
          .map((reference) => waymoRelease.cities.find(
            (referenceCity) => referenceCity.city_id === reference.city_id,
          ))
          .filter((referenceCity): referenceCity is City => !!referenceCity)
          .map(({ city_id, display_name, official_name, latitude, longitude }) => ({
            city_id,
            display_name,
            official_name,
            latitude,
            longitude,
          })),
      }
    : undefined;
  const waymoConfig = waymoRelease
    ? {
        versions: waymoRelease.versions,
        weights: waymoWeights,
        features: waymoRelease.features,
        bounds: waymoRelease.bounds,
        references: waymoRelease.references,
        exclusions: waymoRelease.exclusions,
      }
    : undefined;
  const screenCities = usesWaymoData ? waymoCityList : cities;
  const screenConfig = usesWaymoData ? waymoConfig : config;
  const screenReleaseLabel =
    usesWaymoData && screenConfig
      ? "verified.v2"
      : screenConfig?.versions.data_version;
  const screenRanking = usesWaymoData ? waymoRanking : ranking;
  const screenSelected = usesWaymoData ? waymoSelected : selected;
  const screenWeights = usesWaymoData ? waymoWeights : weights;
  const screenCity = usesWaymoData
    ? waymoRelease?.cities.find((item) => item.city_id === waymoSelected)
    : city;
  const screenExplanation = usesWaymoData ? waymoExplanation : explanation;
  const screenBusy = usesWaymoData ? waymoBusy : busy;
  const screenDataError = usesWaymoData ? waymoError : error;
  const screenRankingError = usesWaymoData ? waymoRankingError : rankingError;
  const screenDetailBusy = usesWaymoData ? waymoDetailBusy : detailBusy;
  const screenDetailError = usesWaymoData ? waymoDetailError : detailError;
  const screenSelectedScore =
    screenRanking &&
    [...screenRanking.ranked, ...screenRanking.unranked].find(
      (result) => result.city_id === screenSelected,
    );
  const screenSensitivity = screenRanking?.weight_sensitivity?.changes.find(
    (change) => change.city_id === screenSelected,
  );
  const screenAvailableCategories = referenceCategories.filter((category) =>
    screenConfig?.references.some(
      (reference) => reference.enabled && reference.category === category,
    ),
  );
  const screenCurrentName =
    screenCities?.cities.find((item) => item.city_id === screenSelected)
      ?.display_name ?? "Select a market";
  const screenVisible = [
    ...(screenRanking?.ranked ?? []),
    ...(screenRanking?.unranked ?? []),
  ].filter((result) =>
    screenCities?.cities
      .find((item) => item.city_id === result.city_id)
      ?.display_name.toLowerCase()
      .includes(search.toLowerCase()),
  );
  const selectedWaymoReference = usesWaymoData
    ? waymoRelease?.references.find(
        (reference) => reference.city_id === waymoSelected,
      )
    : undefined;
  useEffect(() => {
    const list = rankingListRef.current;
    if (!list || !screenSelected) return;
    const item = Array.from(
      list.querySelectorAll<HTMLElement>("[data-city-id]"),
    ).find((candidate) => candidate.dataset.cityId === screenSelected);
    if (!item) return;
    const listBounds = list.getBoundingClientRect();
    const itemBounds = item.getBoundingClientRect();
    if (itemBounds.top < listBounds.top)
      list.scrollTop -= listBounds.top - itemBounds.top;
    else if (itemBounds.bottom > listBounds.bottom)
      list.scrollTop += itemBounds.bottom - listBounds.bottom;
  }, [screenSelected, screenVisible.length]);
  function adjust(key: keyof Weights, value: number) {
    const currentWeights = tab === "waymo" ? waymoWeights : weights;
    const next = { ...currentWeights, [key]: value };
    if (Object.values(next).reduce<number>((a, b) => a + (b ?? 0), 0) > 0)
      tab === "waymo" ? setWaymoWeights(next) : setWeights(next);
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
  function methodologyHref(anchor?: string, evidenceCityId?: string) {
    const params = new URLSearchParams();
    const evidenceCity =
      evidenceCityId ?? (usesWaymoData ? waymoSelected : selected);
    if (evidenceCity) params.set("city", evidenceCity);
    if (usesWaymoData) params.set("source", "waymo");
    const query = params.toString();
    return `/methodology${query ? `?${query}` : ""}${anchor ? `#${anchor}` : ""}`;
  }
  function openEvidence(id: string) {
    const evidenceCity = screenCity?.provenance.some((record) => record.id === id)
      ? screenSelected
      : (screenConfig?.references.find((reference) =>
          reference.provenance_ids.includes(id),
        )?.city_id ?? screenSelected);
    router.push(methodologyHref(provenanceAnchor(id), evidenceCity));
  }
  return (
    <>
      <header className="topbar">
        <button
          className="brand"
          type="button"
          onClick={() => setTab("home")}
          aria-label="ODDyssey home"
        >
          <img className="brand-logo" src="/images/logo.png" alt="ODDYSSEY" />
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
            Markets
          </button>
          <button
            className={tab === "waymo" ? "nav-active" : ""}
            aria-pressed={tab === "waymo"}
            onClick={() => setTab("waymo")}
          >
            Waymo references
          </button>
          <button
            className={tab === "scenario" ? "nav-active" : ""}
            aria-pressed={tab === "scenario"}
            onClick={() => {
              setScenarioOrigin(usesWaymoData ? "waymo" : "markets");
              setTab("scenario");
            }}
            disabled={!(usesWaymoData ? waymoSelected : selected)}
          >
            SimEngine
          </button>
          <Link href={methodologyHref()}>Methodology</Link>
        </nav>
        <button
          className="header-cta"
          onClick={() => setTab(isWaymoPage ? "waymo" : "markets")}
        >
          Explore markets <ArrowRight size={15} />
        </button>
        <span className="status-pill">
          <i
            className={`dot ${usesWaymoData || config?.versions.data_mode === "verified" ? "teal" : "amber"}`}
          />
          {usesWaymoData
            ? "VERIFIED REFERENCE RELEASE"
            : !config
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
          featuredMarkets={featuredMarkets}
          workflowMarkets={workflowMarkets}
          workflowBusy={busy}
          workflowError={rankingError}
          featuredBusy={featuredBusy}
          featuredError={featuredError}
          onExplore={() => setTab("markets")}
        />
      )}
      <main hidden={tab === "home"}>
        <div className="eyebrow page-eyebrow">
          {tab === "waymo"
            ? "WAYMO REFERENCE MARKETS"
            : tab === "markets"
              ? "MARKET EXPLORER"
              : "SIMENGINE"}
        </div>
        <div className="hero figma-page-hero">
          <div>
            <h1>
              {tab === "waymo" ? (
                <>
                  Screen Waymo reference
                  <br />
                  <em>markets on public data.</em>
                </>
              ) : tab === "markets" ? (
                <>
                  Discover the next
                  <br />
                  <em>opportunity.</em>
                </>
              ) : (
                <>
                  What would a fleet
                  <br /> look like here?
                </>
              )}
            </h1>
            <p>
              {tab === "waymo"
                ? "Compare publicly documented Waymo reference metros using ODDyssey’s independent public-data screening scores."
                : tab === "markets"
                  ? "Compare U.S. metropolitan areas using transparent public-data signals."
                  : scenarioOrigin === "waymo"
                    ? screenCurrentName
                    : currentName}
            </p>
          </div>
          <div className="hero-aside">
            <span className="release-badge">
              <i aria-hidden="true" />
              DATA RELEASE {screenReleaseLabel ?? "LOADING"}
            </span>
            <span className="model-badge">
              <i aria-hidden="true" />
              MODEL {screenConfig?.versions.model_version ?? "LOADING"}
            </span>
            <span className="mode-badge">
              <i aria-hidden="true" />
              {screenConfig?.versions.data_mode === "verified"
                ? "VERIFIED PUBLIC DATA"
                : "MOCK DATA · DEMO"}
            </span>
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
          <button onClick={() => router.push(methodologyHref())}>
            Read the scope <ArrowRight size={14} />
          </button>
        </div>
        {screenDataError && (
          <div className="error" role="alert">
            {screenDataError}
            <Button
              variant="outline"
              onClick={() =>
                isWaymoPage
                  ? setWaymoDataRetry((retryValue) => retryValue + 1)
                  : setRetry((retryValue) => retryValue + 1)
              }
            >
              Retry connection
            </Button>
          </div>
        )}
        {fixtureMode && (
          <div className="notice">
            {isWaymoPage
              ? "Verified Waymo-reference release: fixture mode shows precomputed default scores and fixed assumptions."
              : "Fixture replay: fixed default assumptions. Switch to HTTP transport for interactive calculation."}
          </div>
        )}
        {!screenCities || !screenConfig || !screenRanking ? (
          screenDataError || screenRankingError ? (
            <div className="empty async-empty" role="status">
              {screenDataError ? (
                "Market data is unavailable. Retry the connection above to try again."
              ) : (
                <>
                  <span>Ranking is unavailable: {screenRankingError}</span>
                  <Button
                    variant="outline"
                    onClick={() =>
                      isWaymoPage
                        ? setWaymoRetry((value) => value + 1)
                        : setRetry((value) => value + 1)
                    }
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
        ) : tab === "markets" || tab === "waymo" ? (
          <>
            <section className="overview-strip">
              <div>
                <span>SCREENING UNIVERSE</span>
                <strong>
                  {screenCities.cities.length}
                  <small>{isWaymoPage ? " reference markets" : " candidate metros"}</small>
                </strong>
              </div>
              <div>
                <span>ENVIRONMENT REFERENCES</span>
                <strong>
                  {isWaymoPage
                    ? screenRanking.ranked.length
                    : screenRanking.reference_ids.length}
                  <small>{isWaymoPage ? " ranked references" : " selected markets"}</small>
                </strong>
              </div>
              <div>
                <span>PUBLIC FEATURE MODEL</span>
                <strong>
                  {screenConfig.features.length}
                  <small> transparent variables</small>
                </strong>
              </div>
              <div className="snapshot-note">
                <Database size={18} />
                <span>
                  {isWaymoPage
                    ? "Verified public Waymo-reference snapshot."
                    : screenConfig.versions.data_mode === "mock"
                      ? "Synthetic measurements. No verified rankings yet."
                      : "Versioned public evidence."}
                  <small>
                  {screenReleaseLabel ?? screenConfig.versions.data_version} /{" "}
                    {screenConfig.versions.model_version}
                  </small>
                </span>
              </div>
            </section>
            <div className="explorer-grid map-priority-grid">
              <section className="panel ranking-panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">THE SHORTLIST</span>
                    <h2>{isWaymoPage ? "Waymo reference markets" : "Candidate markets"}</h2>
                  </div>
                  {screenBusy ? (
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
                {screenRankingError && (
                  <div className="error view-error" role="alert">
                    Ranking update failed: {screenRankingError}. Showing the last
                    successful ranking.
                    <Button
                      variant="outline"
                      onClick={() =>
                        isWaymoPage
                          ? setWaymoRetry((retryValue) => retryValue + 1)
                          : setRetry((retryValue) => retryValue + 1)
                      }
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
                  className={`ranking-list ${screenBusy ? "is-updating" : ""}`}
                  aria-busy={screenBusy}
                >
                  {screenVisible.map((r) => {
                    const expanded = screenSelected === r.city_id;
                    const name =
                      screenCities.cities.find((c) => c.city_id === r.city_id)
                        ?.display_name ?? r.city_id;
                    const breakdownId = `ranking-breakdown-${r.city_id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                    return (
                      <article
                        className="ranking-item"
                        key={r.city_id}
                        data-city-id={r.city_id}
                      >
                        <button
                          className={`ranking-row ${expanded ? "selected" : ""}`}
                          aria-expanded={expanded}
                          aria-controls={expanded ? breakdownId : undefined}
                          onClick={() => selectCity(r.city_id)}
                        >
                          <span
                            className={`rank-number ${(r.rank ?? 99) <= 3 ? "top-rank" : ""}`}
                          >
                            {r.rank ? String(r.rank).padStart(2, "0") : "—"}
                          </span>
                          {citySkyline(r.city_id) && (
                            <img
                              className="ranking-skyline"
                              src={citySkyline(r.city_id)}
                              alt=""
                              loading="lazy"
                            />
                          )}
                          <span className="city-label">
                            {name}
                            <small>
                              {isWaymoPage
                                ? "WAYMO REFERENCE"
                                : r.rank && r.rank <= 3
                                  ? "TOP CANDIDATE"
                                  : "METRO AREA"}
                            </small>
                          </span>
                          <strong>
                            {r.expansion_score?.toFixed(1) ?? "N/A"}
                          </strong>
                          <ChevronRight size={14} />
                        </button>
                        {expanded && (
                          <div className="ranking-expanded" id={breakdownId}>
                            <span className="expanded-title">
                              PILLAR BREAKDOWN
                            </span>
                            {(
                              Object.keys(pillarNames) as (keyof Weights)[]
                            ).map((key) => (
                              <div className="expanded-pillar" key={key}>
                                <span>
                                  {key === "readiness"
                                    ? "Infrastructure proxies"
                                    : pillarNames[key]}
                                </span>
                                <strong>
                                  {r.pillars[key]?.toFixed(1) ?? "—"}
                                </strong>
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
                              Full factors and evidence{" "}
                              <ArrowUpRight size={12} />
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {!screenVisible.length && (
                    <p className="empty" role="status">
                      {screenRanking.ranked.length + screenRanking.unranked.length === 0
                        ? "This release returned no ranked or unranked metros."
                        : "No metros match this search."}
                    </p>
                  )}
                </div>
              </section>
              <section className="panel map-panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">
                      {isWaymoPage ? "01 / WAYMO REFERENCE MAP" : "01 / MARKET LANDSCAPE"}
                    </span>
                    <h2>
                      {screenSelected ? screenCurrentName : "Opportunity, in perspective."}
                    </h2>
                  </div>
                  <span className="micro-tag">MAPBOX · U.S. METROS</span>
                </div>
                <MarketMapbox
                  cities={screenCities.cities}
                  ranking={screenRanking}
                  selected={screenSelected}
                  focusVersion={mapFocusVersion}
                  onSelect={selectCity}
                />
                <div className="map-bottom">
                  <span>
                    <i className="dot teal" /> {screenRanking.ranked.length} ranked ·{" "}
                    {screenRanking.unranked.length} unranked
                  </span>
                  <span>
                    Markers show metro centers, not service boundaries
                  </span>
                </div>
              </section>
              <EvidenceAssistant
                cityName={screenCurrentName}
                score={screenSelectedScore}
                explanation={screenExplanation}
                loading={screenDetailBusy}
                error={screenDetailError}
                onEvidenceClick={openEvidence}
              />
            </div>
            <section className="panel weights-panel">
              <div>
                <SlidersHorizontal size={20} />
                <h3>
                  What matters most?
                </h3>
                <p>
                  Changing weights recalculates the screening score without
                  changing the underlying data normalization.
                </p>
                <button
                  className="text-button"
                  onClick={() =>
                    isWaymoPage
                      ? setWaymoWeights(initialWeights)
                      : setWeights(screenConfig?.weights ?? initialWeights)
                  }
                >
                  <RotateCcw size={12} /> Reset assumptions
                </button>
              </div>
              <div className="weight-controls">
                {(Object.keys(pillarNames) as (keyof Weights)[]).map((key) => (
                  <label key={key}>
                    <span>
                      {pillarNames[key]}
                    <strong>
                      {((screenRanking.normalized_weights[key] ?? 0) * 100).toFixed(0)}%
                    </strong>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      aria-label={`${pillarNames[key]} weight`}
                      value={screenWeights[key] ?? 0}
                      disabled={fixtureMode || screenBusy}
                      onChange={(e) => adjust(key, Number(e.target.value))}
                    />
                  </label>
                ))}
              </div>
              {!isWaymoPage && (
                <div className="ranking-comparison">
                  <fieldset disabled={fixtureMode || screenBusy}>
                    <legend>Reference categories</legend>
                    {screenAvailableCategories.map((category) => (
                      <label key={category}>
                        <input
                          type="checkbox"
                          checked={selectedCategories.includes(category)}
                          disabled={
                            selectedCategories.length === 1 &&
                            selectedCategories.includes(category)
                          }
                          onChange={() => toggleCategory(category)}
                        />
                        {category}
                      </label>
                    ))}
                    {screenAvailableCategories.length === 1 && (
                      <p>Only category available in this release.</p>
                    )}
                  </fieldset>
                  <div aria-live="polite">
                    <strong>Weight sensitivity · {screenCurrentName}</strong>
                    {fixtureMode ? (
                      <p>
                        Fixture replay shows default ranking only. Use live API
                        for comparisons.
                      </p>
                    ) : screenBusy ? (
                      <p>Updating comparison…</p>
                    ) : screenSensitivity && screenSelectedScore?.rank ? (
                      <p>
                        Default weights: #{screenSensitivity.baseline_rank},{" "}
                        {screenSensitivity.baseline_score.toFixed(1)}. Current
                        weights: #{screenSelectedScore.rank},{" "}
                        {screenSelectedScore.expansion_score?.toFixed(1)}. Rank
                        change: {screenSensitivity.rank_change > 0 ? "+" : ""}
                        {screenSensitivity.rank_change}; score change:{" "}
                        {screenSensitivity.score_change > 0 ? "+" : ""}
                        {screenSensitivity.score_change.toFixed(1)}.
                      </p>
                    ) : (
                      <p>No weight comparison for this metro.</p>
                    )}
                  </div>
                </div>
              )}
            </section>
            <section
              className="panel detail-panel"
              id="city-detail"
              aria-label="Selected metro detail"
            >
              <figure className="detail-skyline">
                {citySkyline(screenSelected) && (
                  <img
                    className="detail-skyline-photo"
                    src={citySkyline(screenSelected)}
                    alt={`${screenCurrentName} skyline`}
                  />
                )}
                <span className="detail-skyline-shade" aria-hidden="true" />
                <svg
                  className="detail-route"
                  viewBox="0 0 1200 600"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    className="detail-route-blue"
                    d="M0 480 C130 380 210 405 315 440 S490 505 615 435 S715 355 785 352"
                  />
                  <path
                    className="detail-route-green"
                    d="M785 352 C875 350 930 360 1000 325 S1120 240 1200 255"
                  />
                  <circle cx="315" cy="440" r="8" />
                  <circle cx="1000" cy="325" r="8" />
                </svg>
                <div className="detail-title">
                  <div>
                    <span className="eyebrow">
                      {isWaymoPage && selectedWaymoReference
                        ? `WAYMO REFERENCE · AS OF ${selectedWaymoReference.status_as_of.slice(0, 10)}`
                        : "SELECTED MARKET"}
                    </span>
                    <h2>{screenCurrentName.split(", ")[0]}</h2>
                    <p>{screenCurrentName.split(", ").slice(1).join(", ")}</p>
                  </div>
                  <div className="score-badge">
                    <strong>{screenSelectedScore?.expansion_score?.toFixed(1) ?? "—"}</strong>
                    <span>
                      EXPANSION
                      <br />
                      SCREENING SCORE
                    </span>
                  </div>
                </div>
                <figcaption>
                  Skyline image for visual context ·{" "}
                  <a href="/photo-credits">Photo credits</a>
                </figcaption>
              </figure>
              {screenDetailError && (
                <div className="error view-error" role="alert">
                  Metro evidence could not load: {screenDetailError}
                  <Button
                    variant="outline"
                    onClick={() =>
                      isWaymoPage
                        ? setWaymoDetailRetry((value) => value + 1)
                        : setDetailRetry((value) => value + 1)
                    }
                  >
                    Retry metro detail
                  </Button>
                </div>
              )}
                <div className="detail-grid">
                <div className="pillar-bars">
                  {(Object.keys(pillarNames) as (keyof Weights)[]).map(
                    (key) => (
                      <article className={`pillar-score-card ${key}`} key={key}>
                        <div className="pillar-score-heading">
                          <strong>
                            {screenSelectedScore?.pillars[key]?.toFixed(0) ?? "—"}
                          </strong>
                          <span>{pillarNames[key]}</span>
                        </div>
                        <div className={`bar-track ${key}`}>
                          <i
                            style={{ width: `${screenSelectedScore?.pillars[key] ?? 0}%` }}
                          />
                        </div>
                        {key === "readiness" && (
                          <small>
                            Public infrastructure proxies; not technical
                            readiness
                          </small>
                        )}
                      </article>
                    ),
                  )}
                  <Link
                    className="text-button"
                    href={methodologyHref("provenance")}
                  >
                    <Database size={14} /> Inspect features & sources{" "}
                    <ArrowUpRight size={13} />
                  </Link>
                </div>
              </div>
              <section className="factor-explorer" aria-labelledby="factor-title">
                <div className="factor-explorer-heading">
                  <div>
                    <span className="eyebrow">EVIDENCE, NOT A BLACK BOX</span>
                    <h2 id="factor-title">Explore the factors</h2>
                  </div>
                  <p>
                    Every measurement keeps its source, period, transformation,
                    and quality context close at hand.
                  </p>
                </div>
                <div className="factor-table">
                  {(["familiarity", "readiness", "opportunity"] as const).map(
                    (pillar) => {
                      const features = screenConfig?.features.filter(
                        (feature) => feature.pillar === pillar,
                      ) ?? [];
                      if (!features.length) return null;
                      const pillarLabel =
                        pillar === "familiarity"
                          ? "ODD Familiarity"
                          : pillar === "readiness"
                            ? "Infrastructure"
                            : "Opportunity";
                      return (
                        <section className="factor-group" key={pillar}>
                          <h3>{pillarLabel}</h3>
                          {features.map((feature) => {
                            const measurement = screenCity?.features[feature.key];
                            const factor = screenSelectedScore?.factors.find(
                              (item) => item.feature === feature.key,
                            );
                            const normalized = factor?.normalized_value;
                            const source = screenCity?.provenance.find((item) =>
                              measurement?.provenance_ids.includes(item.id),
                            );
                            const sourceLabel = source?.source_name ?? "Source unavailable";
                            return (
                              <article className="factor-row" key={feature.key}>
                                <div className="factor-name">
                                  <strong>{feature.label}</strong>
                                  <span
                                    className={`quality-tag ${measurement?.quality ?? "missing"}`}
                                  >
                                    <i aria-hidden="true" />
                                    {measurement?.quality ?? "missing"}
                                  </span>
                                </div>
                                <strong className="factor-value">
                                  {measurement?.value == null
                                    ? "Missing"
                                    : `${measurement.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${measurement.unit ?? feature.unit}`}
                                </strong>
                                <div className="factor-signal">
                                  <div
                                    className={`factor-track${normalized == null ? " unavailable" : ""}`}
                                    aria-label={
                                      normalized == null
                                        ? "Normalized value unavailable"
                                        : `Normalized value ${normalized.toFixed(3)}`
                                    }
                                  >
                                    {normalized != null && (
                                      <i style={{ width: `${normalized * 100}%` }} />
                                    )}
                                  </div>
                                  <span>
                                    {normalized == null
                                      ? "Unavailable"
                                      : `Relative signal · ${normalized.toFixed(2)}`}
                                  </span>
                                </div>
                                <div className="factor-source">
                                  {source ? (
                                    <button
                                      type="button"
                                      onClick={() => openEvidence(source.id)}
                                      title={`${source.source_name} · ${source.period}`}
                                    >
                                      {sourceLabel}
                                    </button>
                                  ) : (
                                    <span>{sourceLabel}</span>
                                  )}
                                  <small>
                                    {source?.period ?? "Period unavailable"} ·{" "}
                                    {feature.transform}
                                  </small>
                                </div>
                              </article>
                            );
                          })}
                        </section>
                      );
                    },
                  )}
                </div>
              </section>
              <section
                className="coverage-summary"
                aria-label="Ranking coverage and flags"
              >
                <div>
                  <span>Configured feature coverage</span>
                  <strong>
                    {screenSelectedScore
                      ? `${(screenSelectedScore.coverage * 100).toFixed(0)}%`
                      : "Unavailable"}
                  </strong>
                </div>
                <div>
                  <span>Ranking exclusions</span>
                  {screenSelectedScore?.exclusion_reasons.length ? (
                    <ul>
                      {screenSelectedScore.exclusion_reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      {screenSelectedScore ? "No exclusion reasons reported." : "Unavailable"}
                    </p>
                  )}
                </div>
                <div>
                  <span>Legal flags · outside numeric score</span>
                  {screenSelectedScore?.legal_flags.length ? (
                    <ul>
                      {screenSelectedScore.legal_flags.map((flag) => (
                        <li key={flag}>{flag}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{screenSelectedScore ? "No legal flags reported." : "Unavailable"}</p>
                  )}
                </div>
              </section>
              <div className="detail-footer">
                <span>
                  Similarity describes selected public features. It does not
                  establish safe deployment.
                </span>
                <Button
                  onClick={() => {
                    setScenarioOrigin(isWaymoPage ? "waymo" : "markets");
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
            cityId={scenarioOrigin === "waymo" ? waymoSelected : selected}
            cityName={
              scenarioOrigin === "waymo"
                ? waymoCityList?.cities.find((item) => item.city_id === waymoSelected)?.display_name ?? "Select a market"
                : currentName
            }
            latitude={
              (scenarioOrigin === "waymo" ? waymoCityList : cities)?.cities.find(
                (item) =>
                  item.city_id ===
                  (scenarioOrigin === "waymo" ? waymoSelected : selected),
              )?.latitude ?? 39.5
            }
            longitude={
              (scenarioOrigin === "waymo" ? waymoCityList : cities)?.cities.find(
                (item) =>
                  item.city_id ===
                  (scenarioOrigin === "waymo" ? waymoSelected : selected),
              )?.longitude ?? -98.5
            }
            onBack={() => setTab(scenarioOrigin === "waymo" ? "waymo" : "markets")}
            referenceMode={scenarioOrigin === "waymo"}
          />
        )}
        <footer>
          <span className="footer-logo">ODDYSSEY</span>
          <span>Public evidence. Explicit assumptions. Better questions.</span>
          <Link href={methodologyHref()}>Scope & methodology <ArrowUpRight size={12} /></Link>
        </footer>
      </main>

    </>
  );
}
