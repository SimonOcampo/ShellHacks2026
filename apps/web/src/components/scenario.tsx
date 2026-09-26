"use client";
import { useEffect, useState } from "react";
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
import { api, fixtureMode } from "@/lib/api/client";
import type { Simulation, SimulationRequest } from "@/lib/api/types";
import { Button } from "./ui/button";
import { SimulationMapbox } from "./mapbox-map";

const defaults = {
  fleet_size: 50,
  days: 7,
  demand_multiplier: 1,
  base_fare_usd: 3,
  price_per_mile_usd: 1.75,
  price_per_minute_usd: 0.3,
  seed: 42,
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
const chartAxisTick = { fontSize: 9, fill: "#c2d0c8" };
export default function Scenario({
  cityId,
  cityName,
  latitude,
  longitude,
  onBack,
}: {
  cityId: string;
  cityName: string;
  latitude: number;
  longitude: number;
  onBack: () => void;
}) {
  const [inputs, setInputs] = useState(defaults);
  const [result, setResult] = useState<Simulation>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
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
    const timer = setTimeout(
      () =>
        api
          .simulate(
            { city_id: cityId, ...inputs } as SimulationRequest,
            controller.signal,
          )
          .then((r) => {
            if (!controller.signal.aborted) {
              setResult(r);
              setHour(0);
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
  }, [cityId, inputs, retry]);
  useEffect(() => {
    if (!playing || !result || reducedMotion) return;
    const interval = setInterval(
      () => setHour((h) => (h >= result.hourly.length - 1 ? 0 : h + 1)),
      160,
    );
    return () => clearInterval(interval);
  }, [playing, result, reducedMotion]);
  const metrics = result?.metrics;
  let cumulative = 0;
  const chart =
    result?.hourly.map((h) => ({
      ...h,
      label: `D${Math.floor(h.hour / 24) + 1} ${String(h.hour % 24).padStart(2, "0")}:00`,
      cumulative_revenue: (cumulative += h.gross_revenue_usd),
    })) ?? [];
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
      background: "#152426",
      border: "1px solid #334749",
      borderRadius: 8,
      color: "#e8efea",
    },
    labelStyle: { color: "#a4b5b0" },
    cursor: { stroke: "#a4b5b0", strokeDasharray: "3 4" },
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
      <SimulationMapbox
        cityName={cityName}
        latitude={latitude}
        longitude={longitude}
        activeHour={hour}
        playing={playing}
        reducedMotion={reducedMotion}
      />
      <div className="scenario-grid">
        <aside className="panel scenario-controls">
          <span className="eyebrow">SCENARIO PARAMETERS</span>
          <h2>{cityName}</h2>
          <p>
            One hypothetical service zone.
            <br />
            Every assumption is adjustable or disclosed.
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
          <div className="assumption-note">
            <i className="dot amber" />
            <p>
              1,000 requests/day baseline is an assumption, not observed local
              demand.
            </p>
          </div>
        </aside>
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
                <LoaderCircle className="spin" aria-hidden="true" /> Running
                fleet operations…
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
              {result.hourly.length === 0 ? (
                <p className="empty async-empty" role="status">
                  No hourly simulation records were returned. Timeline and
                  charts are unavailable for this result.
                </p>
              ) : (
                <>
                  <section className="panel playback">
                    <div>
                      <span className="eyebrow">WEEK IN MOTION</span>
                      <h3>
                        Day {Math.floor(hour / 24) + 1}{" "}
                        <span>/ {String(hour % 24).padStart(2, "0")}:00</span>
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
                      disabled={reducedMotion}
                      onClick={() => setPlaying(!playing)}
                    >
                      {playing ? <Pause size={14} /> : <Play size={14} />}
                    </Button>
                    <label className="playback-slider">
                      <span className="sr-only">Playback hour</span>
                      <input
                        type="range"
                        min="0"
                        max={result.hourly.length - 1}
                        value={hour}
                        onChange={(e) => {
                          setPlaying(false);
                          setHour(Number(e.target.value));
                        }}
                      />
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
                      Auto-play is off; use the hour slider to move through the
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
                              <stop stopColor="#5bddbe" stopOpacity={0.35} />
                              <stop
                                offset="1"
                                stopColor="#5bddbe"
                                stopOpacity={0}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid vertical={false} stroke="#334748" />
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
                            formatter={(value, name) => [
                              chartValue(value),
                              name,
                            ]}
                          />
                          {chart[hour] && (
                            <ReferenceLine
                              x={chart[hour].label}
                              stroke="#71e2c3"
                              strokeDasharray="3 4"
                            />
                          )}
                          <Area
                            name="Requests"
                            dataKey="requests"
                            stroke="#b8a783"
                            fill="transparent"
                            strokeDasharray="4 4"
                            isAnimationActive={false}
                          />
                          <Legend
                            verticalAlign="top"
                            height={28}
                            wrapperStyle={{ fontSize: 10, color: "#e6ede7" }}
                          />
                          <Area
                            name="Completed rides"
                            dataKey="completed_rides"
                            stroke="#5bddbe"
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
                          <CartesianGrid vertical={false} stroke="#334748" />
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
                              stroke="#71e2c3"
                              strokeDasharray="3 4"
                            />
                          )}
                          <Area
                            name="Gross revenue"
                            dataKey="cumulative_revenue"
                            stroke="#d6bd83"
                            fill="#d6bd8312"
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
                          <CartesianGrid vertical={false} stroke="#334748" />
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
                              stroke="#71e2c3"
                              strokeDasharray="3 4"
                            />
                          )}
                          <Line
                            name="Utilization %"
                            dataKey="utilization_pct"
                            stroke="#5bddbe"
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
                          <CartesianGrid vertical={false} stroke="#334748" />
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
                              stroke="#71e2c3"
                              strokeDasharray="3 4"
                            />
                          )}
                          <Line
                            name="Wait minutes"
                            dataKey="average_wait_minutes"
                            stroke="#95a9d9"
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
                    <span>Empty / deadhead miles</span>
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
                    <strong>
                      {number(metrics?.charging_vehicle_hours, 1)}
                    </strong>
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
                  {result.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                  <code>
                    Run {result.simulation_id} · {result.versions.model_version}{" "}
                    · {result.versions.data_mode}
                  </code>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </section>
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
