# Approved foundation and implementation decisions

The user approved the initial implementation plan on 2026-09-26 and subsequently approved expansion of the public-data feature model.

1. Fixed CBSA metros for ranking; separate synthetic simulation zone.
2. Transparent `.40/.20/.40` pillar weights across ODD Familiarity, Readiness, and Opportunity.
3. The active ranking model uses 15 public-data variables. Two additional road variables are collected and exposed but excluded from scoring.
4. Complete-case ranking, frozen normalization, and nearest whole-reference Euclidean similarity.
5. Public charging-only readiness; legal flags remain outside scoring.
6. Seeded discrete-event fleet operations, finite chargers, and explicit unfinished requests.
7. Pydantic-owned contracts and generated TypeScript in a monorepo.
8. Dark map-oriented dashboard with deterministic explanations.
9. Vercel frontend and single Render backend, with no database or queue.

## Active scoring variables

### ODD Familiarity

- `annual_precipitation_mm`
- `annual_snowfall_mm`
- `hot_days_32c`
- `mean_commute_minutes`
- `road_density_km_per_km2`
- `intersection_density_per_km2`
- `freeway_share`
- `arterial_share`
- `local_road_share`

These variables characterize observable climate, travel, and road-network conditions. Familiarity measures similarity to the project's enabled reference markets and must not be interpreted as an autonomous-driving safety score or deployment approval.

### Readiness

- `public_dc_ports_per_100k`
- `population_share_in_counties_with_dc`

Readiness remains limited to observable public charging-infrastructure proxies.

### Opportunity

- `population`
- `population_density_per_km2`
- `zero_vehicle_household_share`
- `transit_commute_share`

Opportunity represents observable market-scale, density, and transportation-demand proxies.

## Collected but excluded from ranking

The following variables are ingested, validated, stored, and available for analysis/UI but do not currently affect the Expansion Screening Score:

- `average_aadt`
- `lane_miles_per_km2`

Their exclusion from scoring allows the project to preserve the data for analysis without assigning ranking influence before their coverage, comparability, and relationship with the other road-network variables are evaluated.

## Implementation clarifications

- The runtime defaults to mock when no verified release exists. It never labels generated measurements as verified.
- Next.js 16 is used after the earlier major's resolved PostCSS dependency triggered advisories. Lockfiles pin installed versions.
- Python package source mappings and editable paths are explicit for the nested monorepo.
- Fixture transport replays known defaults and disables scenario/ranking editing. Interactive calculations run through HTTP.
- API-omitted weights read configuration. Direct pure-engine tests use explicit `RankingRequest` defaults.
- NOAA decoding and geographic joins remain official-data tasks, not fabricated approximations.
- The AFDC API uses its current `developer.nlr.gov` host.
- Road-network processing must preserve the project's fixed CBSA geography and documented source provenance.
- `average_aadt` and `lane_miles_per_km2` are data/display variables and are not ranking inputs.
- Legal evidence remains outside the numerical ranking.

## Forward path and rollback

There was no preexisting application, data, or deployed consumer. The initial contract is v1.

`ranking.v1` remains the immutable mock methodology. The expanded `ranking.v2` registry has 15 active scoring variables; `average_aadt` and `lane_miles_per_km2` remain optional informational measurements. The pipeline export boundary adapts internal five-digit CBSA codes to canonical `cbsa:<code>` IDs and validates against the API contract. A verified release is selected only after completeness, provenance, compatibility, and ranking gates pass.

Preserve old releases and deployments; rollback changes the selected release/configuration rather than mutating historical releases.

Add compatible contract fields before migrating clients. No destructive migration or contract removal is authorized implicitly.

Ranking methodology and configuration changes are versioned so results from the original ten-variable `ranking.v1` model remain distinguishable from the expanded fifteen-variable `ranking.v2` model. The v2 configuration does not switch the running API from its mock v1 release.
