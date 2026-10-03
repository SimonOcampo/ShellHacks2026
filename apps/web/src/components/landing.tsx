"use client";

import { ArrowDown, ArrowRight } from "lucide-react";
import { citySkyline } from "@/lib/city-photos";
import type { Ranking } from "@/lib/api/types";

type FeaturedMarket = {
  id: string;
  name: string;
  score: number | null | undefined;
  rank: number | null;
  pillars: Ranking["ranked"][number]["pillars"];
};

type WorkflowMarket = Pick<FeaturedMarket, "id" | "name" | "score" | "rank">;

function MethodOrbit({ number }: { number: "01" | "02" | "03" }) {
  return (
    <div className="method-orbit" aria-hidden="true">
      <span>{number}</span>
      <svg viewBox="0 0 480 400" focusable="false">
        <ellipse
          className="orbit-dashed"
          cx="240"
          cy="200"
          rx="184"
          ry="132"
          transform="rotate(-48 240 200)"
        />
        <ellipse
          className="orbit-solid"
          cx="240"
          cy="200"
          rx="204"
          ry="91"
          transform="rotate(-18 240 200)"
        />
        <circle className="orbit-core-halo" cx="240" cy="200" r="34" />
        <circle className="orbit-core" cx="240" cy="200" r="10" />
        <circle className="orbit-satellite-halo" cx="348" cy="285" r="15" />
        <circle className="orbit-satellite" cx="348" cy="285" r="5" />
      </svg>
    </div>
  );
}

export default function Landing({
  candidateCount,
  dataMode,
  featuredMarkets,
  workflowMarkets,
  workflowBusy,
  workflowError,
  featuredBusy,
  featuredError,
  onExplore,
}: {
  candidateCount: number | undefined;
  dataMode: string | undefined;
  featuredMarkets: FeaturedMarket[];
  workflowMarkets: WorkflowMarket[];
  workflowBusy: boolean;
  workflowError: string;
  featuredBusy: boolean;
  featuredError: string;
  onExplore: () => void;
}) {
  return (
    <main className="figma-landing">
      <section className="figma-landing-hero">
        <div className="figma-hero-copy">
          <span className="figma-kicker">
            <i /> PUBLIC DATA FOR MOBILITY DECISIONS
          </span>
          <h1>Where could autonomous mobility go next?</h1>
          <p>
            ODDyssey combines public transportation, infrastructure, climate,
            road-network, and demographic data to screen U.S. metropolitan areas
            and explore hypothetical fleet scenarios.
          </p>
          <div className="figma-actions">
            <button className="figma-primary" onClick={onExplore}>
              Explore markets <ArrowRight size={16} />
            </button>
            <a className="figma-secondary" href="#how-it-works">
              How it works <ArrowDown size={15} />
            </a>
            <span className="figma-secondary landing-data-badge">
              <i aria-hidden="true" />
              {dataMode === undefined
                ? "Data mode loading"
                : dataMode === "verified"
                  ? "Verified public data"
                  : "Mock data · demo"}
            </span>
          </div>
        </div>
        <figure className="figma-hero-photo">
          <img
            className="figma-hero-skyline"
            src="/nashville-skyline.jpg"
            alt="Nashville skyline at sunset"
          />
          <div className="figma-photo-shade" aria-hidden="true" />
          <span className="signal-chip chip-climate">Climate</span>
          <span className="signal-chip chip-mobility">Mobility</span>
          <span className="signal-chip chip-roads">Road network</span>
          <span className="signal-chip chip-infrastructure">
            Infrastructure
          </span>
          <span className="signal-chip chip-population">Population</span>
          <svg
            className="mobility-path"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path className="signal-route-underlay" d="M300 230 C390 230 510 160 660 160 S820 270 820 380 S850 640 750 640 S600 630 480 630" />
            <path d="M300 230 C390 230 510 160 660 160 S820 270 820 380 S850 640 750 640 S600 630 480 630" />
          </svg>
          <img className="hero-car-cutout" src="/images/waymocar2-cutout.png" alt="" aria-hidden="true" />
          <figcaption>
            City imagery: Unsplash · Illustrative visual context
          </figcaption>
        </figure>
        <span className="figma-hero-footnote">
          SCREEN BROADLY. <strong>UNDERSTAND LOCALLY.</strong>
        </span>
      </section>
      <section
        className="figma-featured"
        aria-label="Reference market comparison"
      >
        <div className="figma-section-title">
          <div>
            <span className="figma-kicker">
              SCREEN BROADLY. UNDERSTAND LOCALLY.
            </span>
            <h2>Three reference markets, one framework.</h2>
          </div>
          <p>
            San Francisco Bay Area, Miami, and Atlanta are scored against the
            same public-data pillars and weights used for candidate markets.
          </p>
        </div>
        <div className="featured-grid">
          {featuredMarkets.map((market) => (
            <article
              className={`featured-market${market.id === "cbsa:41860" ? " featured-market-sf" : ""}`}
              key={market.id}
            >
              {citySkyline(market.id) ? (
                <img
                  className="featured-skyline"
                  src={citySkyline(market.id)}
                  alt=""
                />
              ) : (
                <span className="featured-market-plain" aria-hidden="true" />
              )}
              <span className="featured-rank">
                {market.rank ? `${String(market.rank).padStart(2, "0")} / 03` : "REFERENCE METRO"}
              </span>
              <div className="featured-overlay">
                <small>REFERENCE MARKET · PUBLIC-DATA COMPARISON</small>
                <div className="featured-title-row">
                  <strong>{market.name.split(",")[0]}</strong>
                </div>
                <span className="featured-score">
                  <b>{market.score == null ? "—" : market.score.toFixed(1)}</b>
                  <span>Expansion screening score</span>
                </span>
                <span className="featured-pillars">
                  <span>Familiarity {market.pillars.familiarity?.toFixed(0) ?? "—"}</span>
                  <span>Infrastructure {market.pillars.readiness?.toFixed(0) ?? "—"}</span>
                  <span>Opportunity {market.pillars.opportunity?.toFixed(0) ?? "—"}</span>
                </span>
              </div>
            </article>
          ))}
        </div>
        <p className="featured-disclosure">
          {dataMode !== "verified"
            ? "Reference scores require the verified data release."
            : featuredBusy
              ? "Calculating reference comparison…"
              : featuredError
                ? "Reference scores are unavailable from this API."
                : "Reference scores use the same weights, pillars, and normalization as the candidate ranking."}{" "}
          Reference metros remain outside the {candidateCount ?? 20}-metro
          expansion shortlist. <a href="/photo-credits">Photo credits</a>
        </p>
      </section>
      <section className="figma-method" id="how-it-works">
        <h2>Three lenses. One clearer picture.</h2>
        <div className="figma-method-grid">
          <article className="method-card method-card-blue">
            <MethodOrbit number="01" />
            <div className="method-copy">
              <h3>ODD Familiarity</h3>
              <p>
                How similar are observable climate, commuting, and road-network
                conditions to enabled reference markets?
              </p>
            </div>
          </article>
          <article className="method-card method-card-teal">
            <MethodOrbit number="02" />
            <div className="method-copy">
              <h3>Infrastructure</h3>
              <p>
                What public charging infrastructure is visible across the metro?
              </p>
            </div>
          </article>
          <article className="method-card method-card-green">
            <MethodOrbit number="03" />
            <div className="method-copy">
              <h3>Opportunity</h3>
              <p>
                What do population, density, and transportation patterns suggest
                about market opportunity?
              </p>
            </div>
          </article>
        </div>
      </section>
      <section className="figma-workflow" aria-labelledby="workflow-heading">
        <h2 className="sr-only" id="workflow-heading">
          From market screening to a hypothetical scenario
        </h2>
        <svg
          className="workflow-route"
          viewBox="0 0 1200 520"
          aria-hidden="true"
        >
          <path
            className="workflow-route-blue"
            d="M388 274 C486 218 532 300 625 284 S742 325 818 267"
          />
          <circle cx="662" cy="286" r="6" />
          <circle cx="818" cy="267" r="7" />
        </svg>
        <div className="workflow-label workflow-label-ranking">
          <span>01</span> RANKING
        </div>
        <article className="workflow-ranking">
          <header>
            <h3>Expansion Screening</h3>
            <span aria-hidden="true" />
          </header>
          {workflowMarkets.length ? (
            <ol>
              {workflowMarkets.slice(0, 3).map((market) => (
                <li key={market.id}>
                  <span className="workflow-rank">
                    {market.rank == null
                      ? "—"
                      : String(market.rank).padStart(2, "0")}
                  </span>
                  <span className="workflow-city">{market.name}</span>
                  <strong>
                    {market.score == null ? "—" : market.score.toFixed(1)}
                  </strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="workflow-ranking-empty">
              {workflowBusy
                ? "Loading public rankings…"
                : workflowError
                  ? "Public rankings unavailable"
                  : "No ranked markets in this release"}
            </p>
          )}
        </article>
        <div className="workflow-label workflow-label-analysis">
          <span>02</span> CITY ANALYSIS
        </div>
        <article className="workflow-scenario">
          <h3>7-day scenario</h3>
          <p className="workflow-example-label">
            Illustrative hypothetical scenario
          </p>
          <div className="workflow-metrics">
            <div>
              <strong>6,420</strong>
              <span>rides</span>
            </div>
            <div>
              <strong>4.8m</strong>
              <span>average wait</span>
            </div>
          </div>
          <svg
            className="workflow-chart"
            viewBox="0 0 420 120"
            aria-hidden="true"
          >
            <path
              className="workflow-chart-blue"
              d="M4 96 C60 82 69 25 118 58 S181 89 225 48 S292 66 329 71 S380 17 416 34"
            />
            <path
              className="workflow-chart-green"
              d="M4 106 C49 96 80 62 117 72 S178 84 220 57 S271 51 310 55 S370 38 416 47"
            />
          </svg>
        </article>
        <div className="workflow-label workflow-label-simengine">
          <span>03</span> SIMENGINE
        </div>
      </section>
      <section className="figma-principles">
        <span className="figma-kicker">OUR PRINCIPLES</span>
        <h2>Built to show its work.</h2>
        <div>
          <article>
            <span>01</span>
            <h3>Public data</h3>
            <p>Verified measurements retain their source and provenance.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Transparent scoring</h3>
            <p>Weights, factors, and assumptions remain visible.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Reproducible simulation</h3>
            <p>Same scenario and seed. Same result.</p>
          </article>
          <article>
            <span>04</span>
            <h3>Clear boundaries</h3>
            <p>
              Screening is not autonomous-driving safety validation or
              deployment approval.
            </p>
          </article>
        </div>
      </section>
      <section className="figma-final">
        <div className="figma-final-copy">
          <h2>
            Explore the
            <br />
            next market.
          </h2>
          <button className="figma-primary" onClick={onExplore}>
            Open market explorer <ArrowRight size={16} />
          </button>
        </div>
        <div className="figma-final-art" aria-hidden="true">
          <div className="final-bars">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <svg
            className="final-route"
            viewBox="0 0 820 300"
            focusable="false"
          >
            <path
              className="final-route-blue"
              d="M0 258 C110 196 168 198 262 230 S426 275 514 206 S690 182 820 106"
            />
            <path
              className="final-route-green"
              d="M408 244 C478 212 524 170 578 156 S704 147 820 106"
            />
            <circle cx="258" cy="230" r="6" />
          </svg>
          <img src="/images/waymocar2-cutout.png" alt="" />
        </div>
      </section>
      <footer className="figma-footer">
        <strong>ODDYSSEY</strong>
        <span>
          Public-data market screening and hypothetical fleet simulation.
        </span>
        <span>
          {dataMode === "verified"
            ? "Verified public evidence"
            : "Mock data · demo"}
        </span>
      </footer>
    </main>
  );
}
