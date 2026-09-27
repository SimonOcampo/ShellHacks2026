"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BatteryCharging,
  CarFront,
  Clock3,
  DollarSign,
  LoaderCircle,
  Play,
  Pause,
  Route,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, ApiError, fixtureMode } from "@/lib/api/client";
import type { Simulation, SimulationRequest } from "@/lib/api/types";
import { Button } from "./ui/button";
import { FleetPlaybackMap } from "./fleet-playback-map";
import { citySkyline } from "@/lib/city-photos";

const defaults = {
  fleet_size: 50,
  days: 7,
  demand_multiplier: 1,
  base_fare_usd: 3,
  price_per_mile_usd: 1.75,
  price_per_minute_usd: 0.3,
  seed: 42,
};
const skylinePhotos: Record<string, string> = {
  Nashville: "/nashville-skyline.jpg",
  Charlotte: "/charlotte-skyline.jpg",
  Tampa: "/tampa-skyline.jpg",
};
const number = (n: number | undefined, digits = 0) =>
  n == null
    ? "—"
    : n.toLocaleString(undefined, { maximumFractionDigits: digits });
const chartValue = (value: unknown, unit = "", digits = 0) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${unit}${number(value, digits)}`
    : "Unavailable";
const chartCurrencyTick = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value))
    return "Unavailable";
  return Math.abs(value) >= 1000
    ? `$${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`
    : chartValue(value, "$");
};
const chartAxisTick = { fontSize: 10, fill: "#63707b" };
export default function Scenario({
  cityId,
  cityName,
  onBack,
  referenceMode,
}: {
  cityId: string;
  cityName: string;
  latitude: number;
  longitude: number;
  onBack: () => void;
  referenceMode: boolean;
}) {
  const [inputs, setInputs] = useState(defaults);
  const [result, setResult] = useState<Simulation>();
  const [previousResult, setPreviousResult] = useState<Simulation>();
  const lastResult = useRef<Simulation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [minute, setMinute] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [playbackNotice, setPlaybackNotice] = useState("");
  const hour = Math.min(
    Math.floor(minute / 60),
    Math.max(0, (result?.hourly.length ?? 1) - 1),
  );
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const skyline =
    citySkyline(cityId) ??
    Object.entries(skylinePhotos).find(([name]) =>
      cityName.includes(name),
    )?.[1];
  useEffect(() => {
    setPreviousResult(undefined);
    setResult(undefined);
    setPlaying(false);
    setMinute(0);
  }, [cityId, referenceMode]);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);
  useEffect(() => {
    if (reducedMotion) setPlaying(false);
  }, [reducedMotion]);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setPlaying(false);
    setPlaybackNotice("");
    const simulate = referenceMode ? api.simulateWaymoReference : api.simulate;
    const request: SimulationRequest = {
      city_id: cityId,
      ...inputs,
      demand_profile_id:
        !fixtureMode && !referenceMode && cityId === "cbsa:39300"
          ? "providence-rism-2015.v1"
          : "synthetic-zone.v1",
      include_playback: !fixtureMode,
    };
    const timer = setTimeout(
      () =>
        simulate(request, controller.signal)
          .catch(async (e: unknown) => {
            if (
              e instanceof ApiError &&
              e.status === 413 &&
              request.include_playback &&
              !controller.signal.aborted
            ) {
              const metricsOnly = await simulate(
                { ...request, include_playback: false },
                controller.signal,
              );
              if (!controller.signal.aborted)
                setPlaybackNotice(
                  "This run exceeds the vehicle playback limit. Metrics cover the complete run; no vehicle trace is displayed.",
                );
              return metricsOnly;
            }
            throw e;
          })
          .then((r) => {
            if (!controller.signal.aborted) {
              const earlier = lastResult.current;
              if (
                earlier?.request.city_id === r.request.city_id &&
                JSON.stringify(earlier.request) !== JSON.stringify(r.request)
              )
                setPreviousResult(earlier);
              lastResult.current = r;
              setResult(r);
              setMinute(0);
              setPlaying(false);
            }
          })
          .catch((e) => {
            if (!controller.signal.aborted) setError(e.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setBusy(false);
          }),
      400,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [cityId, inputs, retry, referenceMode]);
  useEffect(() => {
    if (!playing || !result || reducedMotion || busy) return;
    let last = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      const delta = (Math.min(now - last, 250) / 1000) * speed;
      last = now;
      if (!document.hidden)
        setMinute((m) => Math.min(result.request.days * 1440, m + delta));
    }, 50);
    return () => clearInterval(interval);
  }, [playing, result, reducedMotion, busy, speed]);
  useEffect(() => {
    if (result && minute >= result.request.days * 1440) setPlaying(false);
  }, [minute, result]);
  const metrics = result?.metrics;
  const chart = useMemo(() => {
    let cumulative = 0;
    return (
      result?.hourly.map((h) => ({
        ...h,
        label: `D${Math.floor(h.hour / 24) + 1} ${String(h.hour % 24).padStart(2, "0")}:00`,
        cumulative_revenue: (cumulative += h.gross_revenue_usd),
      })) ?? []
    );
  }, [result]);
  const current = result?.hourly[hour];
  const controls: [
    keyof typeof defaults,
    string,
    number,
    number,
    number,
    string,
  ][] = [
    ["fleet_size", "Fleet size", 1, 200, 1, "vehicles"],
    ["demand_multiplier", "Demand multiplier", 0, 5, 0.1, "× baseline"],
    ["base_fare_usd", "Base fare", 0, 50, 0.25, "USD"],
    ["price_per_mile_usd", "Price / mile", 0, 20, 0.05, "USD"],
    ["price_per_minute_usd", "Price / minute", 0, 5, 0.05, "USD"],
  ];
  const tooltip = {
    contentStyle: {
      background: "#ffffff",
      border: "1px solid #e1e7e4",
      borderRadius: 8,
      color: "#1f2933",
    },
    labelStyle: { color: "#63707b" },
    cursor: { stroke: "#9cabb7", strokeDasharray: "3 4" },
  };
  return (
    <section className="scenario">
      <div className="scenario-heading">
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={14} /> Back to markets
        </button>
        <span className="micro-tag">
          FLEET OPERATIONS · NOT AUTONOMOUS DRIVING
        </span>
      </div>
      <FleetPlaybackMap
        cityName={cityName}
        skyline={skyline}
        result={result?.request.city_id === cityId ? result : undefined}
        minute={minute}
        reducedMotion={reducedMotion}
        busy={busy}
      />
      {playbackNotice && (
        <p className="async-note" role="status">
          {playbackNotice}
        </p>
      )}
      <div className="scenario-grid">
        <aside className="panel scenario-controls">
          <span className="eyebrow">SCENARIO BUILDER</span>
          <h2>Build your fleet</h2>
          <p>
            {cityName} · One hypothetical service zone.
            <br /> Every assumption is adjustable or disclosed.
          </p>
          <div className="controls-divider" />
          <h3>
            <SlidersHorizontal size={15} /> Shape your launch
          </h3>
          {controls.map(([key, label, min, max, step, unit]) => (
            <label className="scenario-control" key={key}>
              <span>
                {label}
                <strong>
                  {inputs[key].toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{" "}
                  <small>{unit}</small>
                </strong>
              </span>
              <input
                disabled={fixtureMode}
                aria-label={label}
                type="range"
                min={min}
                max={max}
                step={step}
                value={inputs[key]}
                onChange={(e) =>
                  setInputs((x) => ({ ...x, [key]: Number(e.target.value) }))
                }
              />
            </label>
          ))}
          <div className="compact-controls">
            <label>
              Days
              <select
                disabled={fixtureMode}
                value={inputs.days}
                onChange={(e) =>
                  setInputs((x) => ({ ...x, days: Number(e.target.value) }))
                }
              >
                {Array.from({ length: 7 }, (_, i) => (
                  <option key={i + 1}>{i + 1}</option>
                ))}
              </select>
            </label>
            <label>
              Random seed
              <input
                aria-label="Random seed"
                disabled={fixtureMode}
                type="number"
                min="0"
                max="4294967295"
                value={inputs.seed}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isInteger(n) && n >= 0 && n <= 4294967295)
                    setInputs((x) => ({ ...x, seed: n }));
                }}
              />
            </label>
          </div>
          <Button variant="outline" onClick={() => setInputs(defaults)}>
            Reset assumptions
          </Button>
          <Button
            onClick={() => setRetry((value) => value + 1)}
            disabled={busy}
          >
            Run simulation <ArrowRight size={15} />
          </Button>
          <div className="assumption-note">
            <i className="dot amber" />
            <p>
              1,000 requests/day baseline is an assumption, not observed local
              demand.
            </p>
          </div>
        </aside>
        <aside
          className="panel scenario-live-panel"
          aria-label="Selected simulation hour"
        >
          <div className="scenario-live-heading">
            <span className="eyebrow">LIVE SIMULATION</span>
            <h3>
              Day {Math.floor(hour / 24) + 1}{" "}
              <small>
                {String(hour % 24).padStart(2, "0")}:
                {String(Math.floor(minute % 60)).padStart(2, "0")}
              </small>
            </h3>
            <p>Hourly API outputs follow the selected playback hour.</p>
          </div>
          <div className="scenario-live-metrics">
            <LiveMetric
              label="Requests"
              value={number(current?.requests)}
              suffix="this hour"
            />
            <LiveMetric
              label="Completed rides"
              value={number(current?.completed_rides)}
              suffix="this hour"
            />
            <LiveMetric
              label="Average wait"
              value={
                current?.average_wait_minutes == null
                  ? "N/A"
                  : number(current.average_wait_minutes, 1)
              }
              suffix={current?.average_wait_minutes == null ? "" : "min"}
            />
            <LiveMetric
              label="Fleet utilization"
              value={`${number(current?.utilization_pct, 1)}%`}
              suffix="this hour"
            />
            <LiveMetric
              label="Gross revenue"
              value={`$${number(current?.gross_revenue_usd)}`}
              suffix="this hour"
            />
          </div>
          <div className="scenario-fleet-preview">
            <span className="eyebrow">VEHICLE SCENE</span>
            <strong>
              {result?.playback ? result.request.fleet_size : "—"}{" "}
              <small>engine vehicles</small>
            </strong>
            <p>
              Vehicle states and positions follow the returned event trace. No
              movement is inferred when playback is unavailable.
            </p>
          </div>
        </aside>
      </div>
      <div className="scenario-results" aria-busy={busy}>
        <div className="results-heading">
          <div>
            <span className="eyebrow">03 / HYPOTHETICAL LAUNCH</span>
            <h2>
              {result?.request.days ?? inputs.days} days. One operating
              scenario.
            </h2>
          </div>
          <span className="status-pill" role="status" aria-live="polite">
            {busy ? (
              <>
                <LoaderCircle size={12} className="spin" aria-hidden="true" />{" "}
                UPDATING…
              </>
            ) : (
              <>
                <i className="dot teal" /> SEEDED & REPRODUCIBLE
              </>
            )}
          </span>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
            {result && <span>Showing the last successful scenario.</span>}
            <Button onClick={() => setRetry((x) => x + 1)}>Retry</Button>
          </div>
        )}
        {busy && result && (
          <p className="async-note" role="status" aria-live="polite">
            Showing the last successful scenario while updated inputs run.
          </p>
        )}
        {!result ? (
          error ? (
            <div className="empty async-empty" role="status">
              Scenario results are unavailable. Retry to run this scenario
              again.
            </div>
          ) : (
            <div className="loading" role="status" aria-live="polite">
              <LoaderCircle className="spin" aria-hidden="true" /> Running fleet
              operations…
            </div>
          )
        ) : (
          <>
            <div className="kpi-grid">
              <Metric
                icon={<Users size={18} />}
                label="RIDES COMPLETED"
                value={number(metrics?.rides_completed)}
                note={`${number(metrics?.total_requests)} requests generated`}
              />
              <Metric
                icon={<Clock3 size={18} />}
                label="AVERAGE WAIT"
                value={
                  metrics?.average_wait_minutes == null
                    ? "N/A"
                    : `${number(metrics.average_wait_minutes, 1)} min`
                }
                note={`p95 ${metrics?.p95_wait_minutes == null ? "N/A" : number(metrics.p95_wait_minutes, 1) + " min"} · completed rides`}
              />
              <Metric
                icon={<CarFront size={18} />}
                label="FLEET UTILIZATION"
                value={`${number(metrics?.utilization_pct, 1)}%`}
                note="Pickup + passenger service time"
              />
              <Metric
                icon={<CarFront size={18} />}
                label="PASSENGER UTILIZATION"
                value={`${number(metrics?.passenger_utilization_pct, 1)}%`}
                note="Passenger travel + dropoff dwell"
              />
              <Metric
                icon={<Route size={18} />}
                label="EMPTY-MILE SHARE"
                value={
                  metrics?.empty_mile_pct == null
                    ? "N/A"
                    : `${number(metrics.empty_mile_pct, 1)}%`
                }
                note="Empty miles / total miles"
              />
              <Metric
                icon={<BatteryCharging size={18} />}
                label="CHARGING VEHICLE-HOURS"
                value={number(metrics?.charging_vehicle_hours, 1)}
                note="Summed vehicle time; queue separate"
              />
              <Metric
                icon={<DollarSign size={18} />}
                label="SIMULATED GROSS REVENUE"
                value={`$${number(metrics?.gross_revenue_usd)}`}
                note="Costs excluded; not profit"
                accent
              />
              <Metric
                icon={<DollarSign size={18} />}
                label="REVENUE PER VEHICLE"
                value={`$${number(metrics?.revenue_per_vehicle_usd)}`}
                note="Gross revenue / vehicles"
                accent
              />
            </div>
            {previousResult && !busy && (
              <section
                className="panel scenario-comparison"
                aria-label="Compare scenarios"
              >
                <div className="scenario-comparison-heading">
                  <div>
                    <span className="eyebrow">COMPARE SCENARIOS</span>
                    <h3>Tune the operation.</h3>
                  </div>
                  <p>Previous and current API results for {cityName}.</p>
                </div>
                <div className="comparison-table">
                  <div className="comparison-header">
                    <span>MEASURE</span>
                    <span>PREVIOUS SCENARIO</span>
                    <span>CURRENT SCENARIO</span>
                  </div>
                  <div>
                    <span>Fleet size</span>
                    <strong>{number(previousResult.request.fleet_size)}</strong>
                    <strong>{number(result.request.fleet_size)}</strong>
                  </div>
                  <div>
                    <span>Average wait</span>
                    <strong>
                      {previousResult.metrics.average_wait_minutes == null
                        ? "N/A"
                        : `${number(previousResult.metrics.average_wait_minutes, 1)} min`}
                    </strong>
                    <strong>
                      {metrics?.average_wait_minutes == null
                        ? "N/A"
                        : `${number(metrics.average_wait_minutes, 1)} min`}
                    </strong>
                  </div>
                  <div>
                    <span>Rejected requests</span>
                    <strong>
                      {number(previousResult.metrics.rejected_requests)}
                    </strong>
                    <strong>{number(metrics?.rejected_requests)}</strong>
                  </div>
                  <div>
                    <span>Fleet utilization</span>
                    <strong>
                      {number(previousResult.metrics.utilization_pct, 1)}%
                    </strong>
                    <strong>{number(metrics?.utilization_pct, 1)}%</strong>
                  </div>
                  <div>
                    <span>Gross revenue</span>
                    <strong>
                      ${number(previousResult.metrics.gross_revenue_usd)}
                    </strong>
                    <strong>${number(metrics?.gross_revenue_usd)}</strong>
                  </div>
                </div>
                <p className="comparison-disclosure">
                  Hypothetical scenarios share the selected model and data
                  release. Gross revenue excludes operating costs.
                </p>
              </section>
            )}
            {result.hourly.length === 0 ? (
              <p className="empty async-empty" role="status">
                No hourly simulation records were returned. Timeline and charts
                are unavailable for this result.
              </p>
            ) : (
              <>
                <section className="panel playback">
                  <div>
                    <span className="eyebrow">WEEK IN MOTION</span>
                    <h3>
                      Day {Math.floor(hour / 24) + 1}{" "}
                      <span>
                        / {String(hour % 24).padStart(2, "0")}:
                        {String(Math.floor(minute % 60)).padStart(2, "0")}
                      </span>
                    </h3>
                  </div>
                  <Button
                    variant="outline"
                    aria-label={
                      reducedMotion
                        ? "Automatic playback disabled by reduced-motion preference"
                        : playing
                          ? "Pause playback"
                          : "Play playback"
                    }
                    disabled={reducedMotion || busy}
                    onClick={() => {
                      if (minute >= result.request.days * 1440) setMinute(0);
                      setPlaying(!playing);
                    }}
                  >
                    {playing ? <Pause size={14} /> : <Play size={14} />}
                  </Button>
                  <label className="playback-slider">
                    <span className="sr-only">Playback minute</span>
                    <input
                      type="range"
                      min="0"
                      max={result.request.days * 1440}
                      step="0.1"
                      value={minute}
                      onChange={(e) => {
                        setPlaying(false);
                        setMinute(Number(e.target.value));
                      }}
                    />
                  </label>
                  <label className="playback-speed">
                    Speed
                    <select
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                    >
                      <option value={1}>1 min / sec</option>
                      <option value={10}>10 min / sec</option>
                      <option value={60}>1 hour / sec</option>
                    </select>
                  </label>
                  <span className="playback-stat">
                    {current?.completed_rides}
                    <small>rides this hour</small>
                  </span>
                  <span className="playback-stat">
                    {number(current?.utilization_pct, 0)}%
                    <small>utilization</small>
                  </span>
                </section>
                {reducedMotion && (
                  <p className="async-note reduced-motion-note" role="status">
                    Auto-play is off; use the minute slider to move through the
                    results.
                  </p>
                )}
                <div className="charts-grid">
                  <ChartPanel
                    title="Hourly requests vs. completed rides"
                    subtitle="Returned counts for each simulated hour"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chart}
                        syncId="simulation-hours"
                        accessibilityLayer
                      >
                        <defs>
                          <linearGradient
                            id="rides-fill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop stopColor="#4d7cff" stopOpacity={0.35} />
                            <stop
                              offset="1"
                              stopColor="#4d7cff"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke="#e1e7e4" />
                        <XAxis
                          dataKey="label"
                          minTickGap={80}
                          tick={chartAxisTick}
                        />
                        <YAxis
                          tick={chartAxisTick}
                          width={42}
                          tickFormatter={(value) => chartValue(value)}
                        />
                        <Tooltip
                          {...tooltip}
                          formatter={(value, name) => [chartValue(value), name]}
                        />
                        {chart[hour] && (
                          <ReferenceLine
                            x={chart[hour].label}
                            stroke="#4d7cff"
                            strokeDasharray="3 4"
                          />
                        )}
                        <Area
                          name="Requests"
                          dataKey="requests"
                          stroke="#17b990"
                          fill="transparent"
                          strokeDasharray="4 4"
                          isAnimationActive={false}
                        />
                        <Legend
                          verticalAlign="top"
                          height={28}
                          wrapperStyle={{ fontSize: 10, color: "#1f2933" }}
                        />
                        <Area
                          name="Completed rides"
                          dataKey="completed_rides"
                          stroke="#4d7cff"
                          fill="url(#rides-fill)"
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartPanel>
                  <ChartPanel
                    title="Cumulative gross revenue"
                    subtitle="Simulated fares · USD · costs excluded"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chart}
                        syncId="simulation-hours"
                        accessibilityLayer
                      >
                        <CartesianGrid vertical={false} stroke="#e1e7e4" />
                        <XAxis
                          dataKey="label"
                          minTickGap={90}
                          tick={chartAxisTick}
                        />
                        <YAxis
                          tick={chartAxisTick}
                          width={52}
                          tickFormatter={chartCurrencyTick}
                        />
                        <Tooltip
                          {...tooltip}
                          formatter={(value) => [
                            chartValue(value, "$"),
                            "Cumulative gross revenue",
                          ]}
                        />
                        {chart[hour] && (
                          <ReferenceLine
                            x={chart[hour].label}
                            stroke="#4d7cff"
                            strokeDasharray="3 4"
                          />
                        )}
                        <Area
                          name="Gross revenue"
                          dataKey="cumulative_revenue"
                          stroke="#17b990"
                          fill="#17b99020"
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartPanel>
                  <ChartPanel
                    title="Fleet utilization"
                    subtitle="Hourly share of total vehicle time in service"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chart}
                        syncId="simulation-hours"
                        accessibilityLayer
                      >
                        <CartesianGrid vertical={false} stroke="#e1e7e4" />
                        <XAxis
                          dataKey="label"
                          minTickGap={90}
                          tick={chartAxisTick}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={chartAxisTick}
                          width={42}
                          tickFormatter={(value) =>
                            chartValue(value, "", 0) + "%"
                          }
                        />
                        <Tooltip
                          {...tooltip}
                          formatter={(value) => [
                            chartValue(value, "%", 1),
                            "Utilization",
                          ]}
                        />
                        {chart[hour] && (
                          <ReferenceLine
                            x={chart[hour].label}
                            stroke="#4d7cff"
                            strokeDasharray="3 4"
                          />
                        )}
                        <Line
                          name="Utilization %"
                          dataKey="utilization_pct"
                          stroke="#4d7cff"
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartPanel>
                  <ChartPanel
                    title="Average pickup wait"
                    subtitle="Mean wait for rides completed that hour · minutes"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chart}
                        syncId="simulation-hours"
                        accessibilityLayer
                      >
                        <CartesianGrid vertical={false} stroke="#e1e7e4" />
                        <XAxis
                          dataKey="label"
                          minTickGap={90}
                          tick={chartAxisTick}
                        />
                        <YAxis
                          tick={chartAxisTick}
                          width={42}
                          tickFormatter={(value) => chartValue(value, "", 0)}
                        />
                        <Tooltip
                          {...tooltip}
                          formatter={(value) => [
                            chartValue(value, " min", 1),
                            "Average pickup wait",
                          ]}
                        />
                        {chart[hour] && (
                          <ReferenceLine
                            x={chart[hour].label}
                            stroke="#4d7cff"
                            strokeDasharray="3 4"
                          />
                        )}
                        <Line
                          name="Wait minutes"
                          dataKey="average_wait_minutes"
                          stroke="#7b8bfa"
                          dot={false}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartPanel>
                </div>
              </>
            )}
            <section className="panel operations-ledger">
              <div className="section-heading">
                <h3>
                  <Route size={16} /> The operating ledger
                </h3>
                <span className="micro-tag">WITHIN SIMULATED WINDOW</span>
              </div>
              <div className="ledger-grid">
                <div>
                  <span>Passenger miles</span>
                  <strong>{number(metrics?.paid_miles)}</strong>
                </div>
                <div>
                  <span>
                    {result.versions.model_version === "simulation.v2"
                      ? "Empty / cruising miles"
                      : "Empty / deadhead miles"}
                  </span>
                  <strong>{number(metrics?.empty_miles)}</strong>
                </div>
                <div>
                  <span>Empty-mile share</span>
                  <strong>
                    {metrics?.empty_mile_pct == null
                      ? "N/A"
                      : number(metrics.empty_mile_pct, 1) + "%"}
                  </strong>
                </div>
                <div>
                  <span>Rejected requests</span>
                  <strong>{number(metrics?.rejected_requests)}</strong>
                </div>
                <div>
                  <span>Unfinished at cutoff</span>
                  <strong>{number(metrics?.unfinished_requests)}</strong>
                </div>
                <div>
                  <span>Charging vehicle-hours</span>
                  <strong>{number(metrics?.charging_vehicle_hours, 1)}</strong>
                </div>
                <div>
                  <span>Charger queue hours</span>
                  <strong>
                    {number(metrics?.charging_queue_vehicle_hours, 1)}
                  </strong>
                </div>
                <div>
                  <span>Rides per vehicle</span>
                  <strong>{number(metrics?.rides_per_vehicle, 1)}</strong>
                </div>
              </div>
            </section>
            <details className="panel assumptions">
              <summary>
                <BatteryCharging size={16} /> Model assumptions & accounting{" "}
                <ArrowRight size={15} />
              </summary>
              <div>
                <p>
                  Resolved fleet: {result.request.fleet_size} vehicles. Seed:{" "}
                  {result.request.seed}. {result.assumptions.charger_count}{" "}
                  private depot chargers. Battery range{" "}
                  {result.assumptions.battery_range_miles} miles; reserve{" "}
                  {result.assumptions.reserve_fraction * 100}%; charge at{" "}
                  {result.assumptions.charge_trigger_fraction * 100}% to{" "}
                  {result.assumptions.charge_target_fraction * 100}%.
                </p>
                <p>
                  Zone radius {result.assumptions.service_zone_radius_miles}{" "}
                  miles. Distance multiplier{" "}
                  {result.assumptions.road_distance_multiplier}. Speed{" "}
                  {result.assumptions.average_speed_mph} mph. Pickup limit{" "}
                  {result.assumptions.max_pickup_wait_minutes} minutes.
                </p>
                {result.versions.model_version === "simulation.v2" && (
                  <p>
                    Idle vehicles cruise between nearby public-model zone points
                    at an assumed speed. The policy uses modeled 2015 trip
                    production weights and is not observed Waymo behavior.
                    Cruising consumes battery and counts as empty miles.
                  </p>
                )}
                {result.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
                <code>
                  Run {result.simulation_id} · {result.versions.model_version} ·{" "}
                  {result.versions.data_mode}
                </code>
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}

function LiveMetric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix: string;
}) {
  return (
    <div className="scenario-live-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {suffix && <small>{suffix}</small>}
    </div>
  );
}
function Metric({
  icon,
  label,
  value,
  note,
  accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className={`panel metric ${accent ? "accent" : ""}`}>
      <span className="metric-label">
        {label}
        {icon}
      </span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function ChartPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel chart-panel">
      <h3>{title}</h3>
      <p>{subtitle}</p>
      <div className="chart" role="group" aria-label={`${title}. ${subtitle}`}>
        {children}
      </div>
    </section>
  );
}
