import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Database,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import MethodologyEvidence from "./methodology-evidence";
import "./methodology.css";

export const metadata: Metadata = {
  title: "Methodology — ODDyssey",
  description:
    "Public data sources, extracted variables, candidate markets, and the ODDyssey screening method.",
};

type MethodologyPageProps = {
  searchParams?: Promise<{
    city?: string | string[];
    source?: string | string[];
  }>;
};

const sourceRecords = [
  {
    number: "01",
    name: "U.S. Census ACS 5-Year Summary File",
    period: "2024 five-year estimates",
    dataset: "B01003 · B08201 · B08301 · B08013 · B08303",
    geography: "CBSA estimates; county population denominators",
    description:
      "Population, households by vehicle availability, commute mode, and commute duration. The corrected commute measure uses aggregate travel minutes divided by workers who did not work from home; B08301 remains the transit-share universe. Both commute inputs and their margins of error are recorded for all 35 candidate and reference CBSAs. Input MOEs are not confidence intervals for the derived ratio or score.",
    url: "https://www.census.gov/programs-surveys/acs/data.html",
    linkLabel: "Census ACS data",
  },
  {
    number: "02",
    name: "U.S. Census TIGER/Line geography and roads",
    period: "2024 CBSA, county, and county-edge geography",
    dataset: "TIGER/Line CBSA · County · Edges",
    geography: "Official CBSA polygons and member counties",
    description:
      "CBSA and county polygons define the comparison area. Whole member-county land area uses Census ALAND; counties are assigned by representative point. TIGER network edges supply public road centerline length, road classes, and junction topology. Walkways, trails, private resource roads, and parking-lot roads are excluded. City-proper boundaries are not used for ranking.",
    url: "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_cbsa_500k.zip",
    linkLabel: "2024 Census CBSA geography",
  },
  {
    number: "03",
    name: "NOAA NCEI U.S. Climate Normals",
    period: "1991–2020 climate normals",
    dataset: "Annual precipitation · snowfall · days with Tmax ≥ 90°F",
    geography: "NOAA station points mapped to CBSA representative points",
    description:
      "Precipitation and snowfall use the nearest reporting station within 100 km. Hot-day counts average up to three qualifying stations in that radius. The pipeline requests standard units and quality attributes, records station IDs and distances, and leaves unavailable snowfall missing.",
    url: "https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals",
    linkLabel: "NOAA climate normals",
  },
  {
    number: "04",
    name: "Alternative Fuels Data Center / NLR",
    period: "Current public station snapshot in the release",
    dataset: "AFDC alternative-fuel stations · public DC fast charging",
    geography: "Station points joined to 2024 CBSA and county polygons",
    description:
      "Filter electric-fuel (ELEC), public-access stations with operational status E; count reported DC fast ports, deduplicate station IDs, and join coordinates to frozen geography. Missing DC counts invalidate the feature. Public charging does not measure private depot access or secured fleet capacity.",
    url: "https://afdc.energy.gov/data_download",
    linkLabel: "AFDC data downloads",
  },
  {
    number: "05",
    name: "Waymo public market evidence",
    period: "Status evidence dated 2026-09-26",
    dataset: "waymo_markets · public rides and market-status page",
    geography: "Publicly named reference metros mapped to CBSAs",
    description:
      "Dated public operator evidence defines the reference-market cohort and its recorded category. The verified.v2 release contains 15 enabled commercial references. This public snapshot is not evidence of private fleet availability, internal strategy, or service coverage beyond what the source states.",
    url: "https://waymo.com/rides/",
    linkLabel: "Waymo public ride markets",
  },
  {
    number: "06",
    name: "PublicaMundi MappingAPI state boundaries",
    period: "Bundled illustrative U.S. state GeoJSON",
    dataset: "us-states.json",
    geography: "State shapes for map display only",
    description:
      "This bundled map layer provides visual context. It is not the scoring geography and is not used for CBSA or county joins. Upstream attribution is preserved.",
    url: "https://github.com/PublicaMundi/MappingAPI/blob/master/data/geojson/us-states.json",
    linkLabel: "PublicaMundi source file",
  },
];

const variableGroups = [
  {
    key: "familiarity",
    name: "ODD familiarity",
    total: "40% of score",
    intro:
      "Public climate, commute, and road-network proxies. Familiarity compares a candidate with a whole reference environment.",
    rows: [
      [
        "Annual precipitation",
        "annual_precipitation_mm",
        "mm/year",
        "Nearest qualifying NOAA 1991–2020 station within 100 km; convert inches to millimeters.",
        "10%",
        "log1p",
        "NOAA NCEI",
      ],
      [
        "Annual snowfall",
        "annual_snowfall_mm",
        "mm/year",
        "Nearest NOAA station reporting snowfall within 100 km; convert inches to millimeters. Missing is not zero.",
        "10%",
        "log1p",
        "NOAA NCEI",
      ],
      [
        "Days at or above 90°F",
        "hot_days_32c",
        "days/year",
        "Mean annual days with maximum temperature ≥ 90°F (32.22°C), averaged across up to three qualifying stations within 100 km.",
        "10%",
        "linear",
        "NOAA NCEI",
      ],
      [
        "Mean commute",
        "mean_commute_minutes",
        "minutes",
        "B08013_E001 aggregate travel minutes ÷ B08303_E001 workers not working from home.",
        "20%",
        "linear",
        "2024 ACS",
      ],
      [
        "Road density",
        "road_density_km_per_km2",
        "km/km²",
        "Included TIGER road centerline kilometers ÷ CBSA land area in km².",
        "10%",
        "log1p",
        "2024 TIGER/Line",
      ],
      [
        "Intersection density",
        "intersection_density_per_km2",
        "intersections/km²",
        "Consolidated degree-three-or-higher road junctions ÷ CBSA land area in km². Nearby divided-road junctions are clustered within 20 m.",
        "10%",
        "log1p",
        "2024 TIGER/Line",
      ],
      [
        "Freeway share",
        "freeway_share",
        "fraction",
        "Length of Census road classes S1100 and S1630 ÷ included road length.",
        "10%",
        "linear",
        "2024 TIGER/Line",
      ],
      [
        "Arterial share",
        "arterial_share",
        "fraction",
        "Length of Census road class S1200 ÷ included road length.",
        "10%",
        "linear",
        "2024 TIGER/Line",
      ],
      [
        "Local-road share",
        "local_road_share",
        "fraction",
        "Length of classes S1400, S1640, and S1730 ÷ included road length. A Census road-class grouping, not an FHWA functional class.",
        "10%",
        "linear",
        "2024 TIGER/Line",
      ],
    ],
  },
  {
    key: "readiness",
    name: "Public infrastructure",
    total: "20% of score",
    intro:
      "Public charging quantity and coarse county coverage. Neither measure establishes a private depot or technical readiness.",
    rows: [
      [
        "Public DC ports per 100,000 people",
        "public_dc_ports_per_100k",
        "ports/100,000 people",
        "Deduplicated operational public DC fast ports ÷ CBSA population × 100,000.",
        "70%",
        "log1p",
        "AFDC / NLR + ACS",
      ],
      [
        "Population in counties with public DC",
        "population_share_in_counties_with_dc",
        "fraction of CBSA population",
        "Population in member counties with at least one operational public DC port ÷ CBSA population.",
        "30%",
        "linear",
        "AFDC / NLR + ACS",
      ],
    ],
  },
  {
    key: "opportunity",
    name: "Market opportunity",
    total: "40% of score",
    intro:
      "Scale and transportation context. These variables are not observed ride-hailing demand.",
    rows: [
      [
        "Resident population",
        "population",
        "persons",
        "2024 ACS B01003_E001 published CBSA estimate.",
        "30%",
        "log1p",
        "2024 ACS",
      ],
      [
        "Population density",
        "population_density_per_km2",
        "persons/km²",
        "Resident population ÷ CBSA land area in km²; water area excluded.",
        "25%",
        "log1p",
        "ACS + 2024 TIGER/Line",
      ],
      [
        "Zero-vehicle household share",
        "zero_vehicle_household_share",
        "fraction of households",
        "2024 ACS B08201_E002 households with no vehicle ÷ B08201_E001 total households.",
        "30%",
        "linear",
        "2024 ACS",
      ],
      [
        "Transit commute share",
        "transit_commute_share",
        "fraction of workers 16+",
        "2024 ACS B08301_E010 public-transit commuters ÷ B08301_E001 workers in the commute-mode universe.",
        "15%",
        "linear",
        "2024 ACS",
      ],
    ],
  },
];

const optionalVariables = [
  {
    label: "Average annual daily traffic · vehicles/day",
    key: "average_aadt",
    reason:
      "Unavailable for all 20 candidates. The current TIGER/Line source has no AADT field, and no current complete, CBSA-comparable HPMS layer was obtained.",
  },
  {
    label: "Lane miles per km² · lane-miles/km²",
    key: "lane_miles_per_km2",
    reason:
      "Unavailable for all 20 candidates. TIGER/Line has no lane-count field; incomplete legacy coverage is not used to infer a value.",
  },
];

const candidateMarkets = [
  "Jacksonville, Florida",
  "Columbus, Ohio",
  "Indianapolis, Indiana",
  "Milwaukee, Wisconsin",
  "Memphis, Tennessee",
  "Louisville, Kentucky",
  "Oklahoma City, Oklahoma",
  "El Paso, Texas",
  "Albuquerque, New Mexico",
  "Kansas City, Missouri",
  "Cincinnati, Ohio",
  "Cleveland, Ohio",
  "Raleigh, North Carolina",
  "Virginia Beach, Virginia",
  "Richmond, Virginia",
  "Salt Lake City, Utah",
  "Birmingham, Alabama",
  "Tulsa, Oklahoma",
  "Providence, Rhode Island",
  "Hartford, Connecticut",
];

const referenceMarkets = [
  "Phoenix, Arizona",
  "San Francisco Bay Area, California",
  "Los Angeles, California",
  "Austin, Texas",
  "Atlanta, Georgia",
  "Dallas, Texas",
  "Denver, Colorado",
  "Houston, Texas",
  "Miami, Florida",
  "Nashville, Tennessee",
  "Orlando, Florida",
  "San Antonio, Texas",
  "San Diego, California",
  "Tampa, Florida",
  "Las Vegas, Nevada",
];

const methodSteps = [
  {
    title: "Freeze a release and comparison cohort",
    copy: "Each result is bound to one immutable data release and one model version. The verified.v2 normalization cohort includes all 20 configured candidates and 15 enabled, complete reference metros. No city outside that set contributes to the bounds.",
  },
  {
    title: "Transform and normalize each feature",
    copy: "Apply the registry transform first: linear values stay unchanged; log1p requires a finite, nonnegative value. Normalize against the release’s frozen minimum and maximum, then clip to [0, 1]. A constant feature is removed globally for that release. Bounds never refit when filters, reference choices, or weights change.",
  },
  {
    title: "Score the three pillars",
    copy: "Familiarity measures weighted Euclidean distance across the nine normalized ODD features to each eligible complete reference vector; the nearest whole reference is selected, with similarity = 100 × (1 − distance). Readiness and Opportunity are weighted combinations of their normalized features.",
  },
  {
    title: "Combine and rank",
    copy: "Combine Familiarity at 40%, Readiness at 20%, and Opportunity at 40%. Sort by full-precision Expansion Score, then canonical city ID. Scores are relative indices for their release, not probabilities, demand forecasts, or comparable values across releases.",
  },
  {
    title: "Keep missingness and legal context explicit",
    copy: "All 15 required ranking measurements must be present for a candidate to be ranked. No imputation or city-specific weight redistribution occurs. Optional road fields do not affect rankability. Legal evidence stays outside the numeric score.",
  },
];

function SectionHeading({
  number,
  eyebrow,
  title,
  description,
}: {
  number: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="method-section-heading">
      <span className="method-section-number">{number}</span>
      <div>
        <p className="method-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="method-section-description">{description}</p>
      </div>
    </header>
  );
}

export default async function MethodologyPage({
  searchParams,
}: MethodologyPageProps) {
  const params = (await searchParams) ?? {};
  const selectedCity = Array.isArray(params.city)
    ? params.city[0]
    : params.city;
  const selectedSource = Array.isArray(params.source)
    ? params.source[0]
    : params.source;

  return (
    <div className="methodology-page">
      <header className="methodology-topbar">
        <Link className="methodology-brand" href="/" aria-label="ODDyssey home">
          <img src="/images/logo.png" alt="ODDYSSEY" />
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/">Explorer</Link>
          <Link href="/methodology" aria-current="page" className="nav-active">
            Methodology
          </Link>
        </nav>
        <Link className="methodology-header-cta" href="/">
          Explore markets <ArrowRight size={16} />
        </Link>
      </header>

      <main className="methodology-main">
        <section
          className="methodology-hero"
          aria-labelledby="methodology-title"
        >
          <div className="methodology-hero-copy">
            <h1 id="methodology-title">Methodology</h1>
            <p className="methodology-hero-description">
              A clear record of where the evidence comes from, what we extract,
              which metros enter the comparison, and how the screening score is
              built.
            </p>
            <p className="methodology-hero-note">
              Public-data market screening and hypothetical fleet operations.
              Not a safety assessment or deployment approval.
            </p>
          </div>
          <figure className="methodology-hero-visual">
            <img
              src="/chicago.jpg"
              alt="Chicago skyline and river used as visual context"
            />
            <figcaption>
              <span>REFERENCE ENVIRONMENT</span>
              <strong>Evidence starts with place.</strong>
              <small>Illustrative image · not a scoring input</small>
            </figcaption>
          </figure>
          <img className="hero-car-cutout" src="/images/waymocar2-cutout.png" alt="" aria-hidden="true" />
        </section>

        <nav className="methodology-index" aria-label="On this page">
          <a href="#provenance">
            <span>01</span> Provenance
          </a>
          <a href="#variables">
            <span>02</span> Variables
          </a>
          <a href="#cities">
            <span>03</span> Cities tested
          </a>
          <a href="#method">
            <span>04</span> Method
          </a>
        </nav>

        <section className="methodology-section" id="provenance">
          <SectionHeading
            number="01"
            eyebrow="SOURCE REGISTER"
            title="Start with provenance"
            description="The verified.v2 public-data release links every available measurement to its saved evidence record. It records the source, period, geography, transformation, assumptions, retrieval time, and raw-file hash so a number can be traced back to its input."
          />

          <div className="release-strip" aria-label="Verified release details">
            <div>
              <span>REFERENCE RELEASE</span>
              <strong>verified.v2</strong>
            </div>
            <div>
              <span>DATA VERSION</span>
              <code>
                2024-acs5__2024-tiger__NOAA-1991-2020__TIGER-edges-2024__AFDC-current__commute-B08013-B08303-r2
              </code>
            </div>
            <div>
              <span>COHORT</span>
              <strong>20 candidates + 15 references</strong>
            </div>
            <div>
              <span>RANKING ID</span>
              <code>e1e3650e5a6a13ca8a48</code>
            </div>
            <div>
              <span>RELEASE SHA-256</span>
              <code>
                8533f5fec66352797963cd41a23430642bac6ad0ff0a50569449d013a9445df6
              </code>
            </div>
          </div>

          <div className="source-register">
            {sourceRecords.map((source) => (
              <article className="source-register-row" key={source.number}>
                <div className="source-register-title">
                  <span>{source.number}</span>
                  <div>
                    <h3>{source.name}</h3>
                    <small>{source.period}</small>
                  </div>
                </div>
                <dl className="source-register-meta">
                  <div>
                    <dt>Dataset / variables</dt>
                    <dd>{source.dataset}</dd>
                  </div>
                  <div>
                    <dt>Geography</dt>
                    <dd>{source.geography}</dd>
                  </div>
                </dl>
                <div className="source-register-description">
                  <p>{source.description}</p>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.linkLabel} <ArrowUpRight size={14} />
                  </a>
                </div>
              </article>
            ))}
          </div>

          <aside className="provenance-contract">
            <div className="provenance-contract-icon">
              <Database size={20} />
            </div>
            <div>
              <h3>What each evidence record keeps</h3>
              <p>
                Source name and public URL · dataset ID · period · retrieval
                date · source and target geography · transformation · explicit
                assumptions · raw SHA-256. Missing measurements keep a missing
                reason; no missing value is converted to zero.
              </p>
            </div>
          </aside>

          <aside className="source-audit-note">
            <strong>Audit scope</strong>
            <p>
              The verified.v2 commute correction binds its parent release,
              parent audit, parent manifest, and new Census inputs by SHA-256.
              Unchanged source checks are inherited from the recorded parent
              audit; this is not a fresh full replay. A full replay still
              requires the original raw/intermediate bundle. Removed road ZIPs
              retain hashes in the manifest, while their raw files are not in
              the repository. This is a source-audit reference, not a switch for
              the explorer’s active runtime. Mock data remains a separate
              release; the selected metro record below shows its actual data
              mode.
            </p>
          </aside>

          <MethodologyEvidence cityId={selectedCity} source={selectedSource} />
        </section>

        <section className="methodology-section" id="variables">
          <SectionHeading
            number="02"
            eyebrow="EXTRACTION REGISTRY"
            title="Variables extracted from those sources"
            description="The active ranking.v2 model has 15 required variables, grouped into three pillars. We show the source and extraction rule beside the exact registry key, transformation, and within-pillar weight."
          />

          {variableGroups.map((group) => (
            <section className={`variable-group ${group.key}`} key={group.key}>
              <header className="variable-group-heading">
                <div>
                  <span>
                    {group.key === "familiarity"
                      ? "A"
                      : group.key === "readiness"
                        ? "B"
                        : "C"}
                  </span>
                  <h3>{group.name}</h3>
                </div>
                <strong>{group.total}</strong>
                <p>{group.intro}</p>
              </header>
              <div className="variable-table-wrap">
                <table className="variable-table">
                  <caption className="sr-only">
                    {group.name} variable registry
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Variable</th>
                      <th scope="col">Unit</th>
                      <th scope="col">Extraction</th>
                      <th scope="col">Source</th>
                      <th scope="col">Weight</th>
                      <th scope="col">Transform</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map(
                      ([
                        label,
                        key,
                        unit,
                        definition,
                        weight,
                        transform,
                        source,
                      ]) => (
                        <tr key={key}>
                          <th scope="row">
                            <strong>{label}</strong>
                            <code>{key}</code>
                          </th>
                          <td>{unit}</td>
                          <td>{definition}</td>
                          <td>{source}</td>
                          <td>{weight}</td>
                          <td>
                            <code>{transform}</code>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <aside className="optional-variable-note">
            <div className="optional-variable-heading">
              <span>INFORMATIONAL ONLY</span>
              <h3>Two road measures stay outside the score</h3>
              <p>
                They can be represented as missing with an explicit reason. They
                do not affect coverage or rankability.
              </p>
            </div>
            <div className="optional-variable-list">
              {optionalVariables.map((item) => (
                <article key={item.key}>
                  <h4>
                    {item.label} <code>{item.key}</code>
                  </h4>
                  <p>{item.reason}</p>
                  <small>Weight: none · not normalized · not scored</small>
                </article>
              ))}
            </div>
          </aside>
        </section>

        <section className="methodology-section" id="cities">
          <SectionHeading
            number="03"
            eyebrow="COMPARISON COHORT"
            title="Cities being tested"
            description="Each named market resolves to an official Census CBSA, keeping the whole regional geography consistent across Census, charging, and road inputs."
          />

          <div className="city-selection-note">
            <div className="city-selection-mark">
              <MapPin size={20} />
            </div>
            <div>
              <h3>Why this set?</h3>
              <p>
                The 20 candidate metros are the project’s configured target
                expansion cohort. The repository does not record a city-by-city
                inclusion rationale or a quantitative nationwide selection
                cutoff, so this set should not be read as a representative U.S.
                sample or as the highest-scoring metros nationwide. CBSA-level
                comparison was selected because metro geographies capture
                regional travel and align with the source data better than
                city-proper boundaries.
              </p>
            </div>
          </div>

          <div className="city-cohort-grid">
            <section className="city-cohort candidate-cohort">
              <header>
                <span>20 MARKETS</span>
                <h3>Candidate expansion cohort</h3>
                <p>Configured candidates evaluated by the screening model.</p>
              </header>
              <ol>
                {candidateMarkets.map((city, index) => (
                  <li key={city}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {city}
                  </li>
                ))}
              </ol>
            </section>
            <section className="city-cohort reference-cohort">
              <header>
                <span>15 MARKETS · EVIDENCE AS OF 2026-09-26</span>
                <h3>Waymo public reference cohort</h3>
                <p>
                  Enabled commercial reference metros used for normalization and
                  familiarity comparisons.
                </p>
              </header>
              <ol>
                {referenceMarkets.map((city, index) => (
                  <li key={city}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {city}
                  </li>
                ))}
              </ol>
            </section>
          </div>
          <p className="cohort-footnote">
            The 15 reference metros belong to the normalization cohort; they are
            not candidates in the expansion ranking. Reference status reflects
            dated public evidence and does not establish service boundaries or
            fleet availability.
          </p>
        </section>

        <section className="methodology-section" id="method">
          <SectionHeading
            number="04"
            eyebrow="SCORING METHOD"
            title="How the comparison is built"
            description="The engine is deterministic and release-based. It uses only the configured public measurements and explicit model assumptions."
          />

          <div className="pillar-balance" aria-label="Pillar score weights">
            <div>
              <span>01 / FAMILIARITY</span>
              <strong>40%</strong>
              <small>Climate, commute, and road context</small>
            </div>
            <div>
              <span>02 / READINESS</span>
              <strong>20%</strong>
              <small>Public charging quantity and county coverage</small>
            </div>
            <div>
              <span>03 / OPPORTUNITY</span>
              <strong>40%</strong>
              <small>Population and transportation context</small>
            </div>
          </div>

          <ol className="method-steps">
            {methodSteps.map((step, index) => (
              <li key={step.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </div>
              </li>
            ))}
          </ol>

          <aside className="hypothetical-ops-note">
            <div>
              <span>SEPARATE SIMENGINE EXERCISE</span>
              <h3>Hypothetical operations</h3>
            </div>
            <p>
              Scenario runs use a synthetic service zone, assumed demand, and
              assumed private depot capacity. They do not model perception,
              vehicle physics, street routing, or safety testing. Gross revenue
              is not profit.
            </p>
          </aside>

          <div className="method-limit-grid">
            <aside className="method-limit-card">
              <ShieldCheck size={20} />
              <div>
                <h3>What the score does not say</h3>
                <p>
                  It does not assess autonomous-vehicle safety, certify
                  deployment readiness, predict ridership, or reproduce a
                  private operator’s model. Public charging is not private depot
                  capacity; commute time is not traffic congestion; population
                  measures are not observed demand.
                </p>
              </div>
            </aside>
            <aside className="method-history-card">
              <span>MODEL HISTORY</span>
              <h3>ranking.v2 is the expanded model</h3>
              <p>
                The mock ranking.v1 release preserves a separate historical
                ten-variable model. Its results and fixtures stay tied to that
                release and must not be described as ranking.v2.
              </p>
            </aside>
          </div>
        </section>

        <footer className="methodology-footer">
          <Link href="/" className="methodology-footer-brand">
            ODDYSSEY
          </Link>
          <span>Public evidence. Explicit assumptions. Better questions.</span>
          <Link href="/photo-credits">
            Image credits <ArrowUpRight size={14} />
          </Link>
        </footer>
      </main>
    </div>
  );
}
