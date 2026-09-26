"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  MapPinned,
  SlidersHorizontal,
  Waypoints,
} from "lucide-react";

const waymoImage = "/waymo-vehicle.jpg";

export default function Landing({
  candidateCount,
  dataMode,
  canSimulate,
  onExplore,
  onSimulate,
}: {
  candidateCount: number | undefined;
  dataMode: string | undefined;
  canSimulate: boolean;
  onExplore: () => void;
  onSimulate: () => void;
}) {
  return (
    <main className="landing-page">
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="landing-eyebrow">
            <i /> PUBLIC SIGNALS / OPEN QUESTIONS
          </span>
          <h1>
            Expansion starts
            <br />
            <em>with a better question.</em>
          </h1>
          <p>
            Compare the public shape of new markets. See which signals lift a
            city, where evidence is thin, and what a hypothetical first week
            might look like.
          </p>
          <div className="landing-actions">
            <button className="landing-primary" onClick={onExplore}>
              Explore candidate cities <ArrowRight size={16} />
            </button>
            <button
              className="landing-secondary"
              onClick={onSimulate}
              disabled={!canSimulate}
            >
              Open fleet simulator <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="landing-boundary">
            <span>SCREENING TOOL</span>
            <p>
              Public-data market screening and hypothetical fleet simulation.
              Not an assessment of AV safety or deployment approval.
            </p>
          </div>
        </div>
        <figure className="landing-photo">
          <img
            src={waymoImage}
            alt="Waymo autonomous vehicle serving riders in Phoenix"
          />
          <div className="photo-shade" aria-hidden="true" />
          <div className="photo-index">
            <span>FIELD NOTE / 001</span>
            <strong>
              Mobility
              <br />
              has a new map.
            </strong>
          </div>
          <div className="photo-coordinate">
            <i /> PHOENIX, AZ <span>33.45° N / 112.07° W</span>
          </div>
          <figcaption>
            Reference image for educational use. Source:{" "}
            <a
              href="https://waymo.com/media-resources/"
              target="_blank"
              rel="noreferrer"
            >
              Waymo media resources <ArrowUpRight size={11} />
            </a>
          </figcaption>
        </figure>
      </section>
      <section className="landing-method" aria-label="How ODD Scout works">
        <div className="landing-method-intro">
          <span className="eyebrow">FROM SIGNAL TO SCENARIO</span>
          <h2>
            Read the market.
            <br />
            <em>Pressure-test the plan.</em>
          </h2>
        </div>
        <article>
          <span className="method-number">01</span>
          <MapPinned size={20} />
          <h3>Scan public context</h3>
          <p>
            Compare climate, mobility, infrastructure, and market proxies across
            candidate metros.
          </p>
          <span className="method-link">
            {candidateCount
              ? `${candidateCount} candidate metros`
              : "Candidate metros"}{" "}
            <ArrowRight size={12} />
          </span>
        </article>
        <article>
          <span className="method-number">02</span>
          <SlidersHorizontal size={20} />
          <h3>Choose what matters</h3>
          <p>
            Adjust three transparent ranking pillars. See the shortlist respond
            to your assumptions.
          </p>
          <span className="method-link">
            No hidden score <ArrowRight size={12} />
          </span>
        </article>
        <article>
          <span className="method-number">03</span>
          <Waypoints size={20} />
          <h3>Model a first week</h3>
          <p>
            Change fleet and pricing inputs. Explore demand, waits, utilization,
            and simulated revenue.
          </p>
          <span className="method-link">
            Seven-day scenario <ArrowRight size={12} />
          </span>
        </article>
      </section>
      <section className="landing-signal">
        <div>
          <span className="eyebrow">A CLEARER KIND OF FORECAST</span>
          <h2>
            Public evidence in.
            <br />
            <em>Explicit assumptions out.</em>
          </h2>
        </div>
        <p>
          ODD Scout helps teams decide where to investigate next. It does not
          reproduce Waymo&apos;s systems or predict a real launch. Every score
          and simulation depends on disclosed public features and modeled
          inputs.
        </p>
        <button onClick={onExplore}>
          See the market map <ArrowDownRight size={15} />
        </button>
      </section>
      <footer className="landing-footer">
        <span>ODD SCOUT / EXPANSION INTELLIGENCE</span>
        <span>
          {candidateCount == null
            ? "Connecting to market data"
            : `${candidateCount} candidate metros`}{" "}
          ·{" "}
          {dataMode === "verified"
            ? "Versioned public evidence"
            : "Mock data · demo"}
        </span>
        <a
          href="https://waymo.com/media-resources/"
          target="_blank"
          rel="noreferrer"
        >
          Image credit <ArrowUpRight size={11} />
        </a>
      </footer>
    </main>
  );
}
