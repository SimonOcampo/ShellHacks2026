# Screening methodology v1

This is an early-stage public-feature comparison, not a safety, technical readiness, regulatory approval, or deployment probability model. The formulas and weights are project assumptions, not Waymo's private methodology.

[Waymo's public framework](https://waymo.com/blog/2020/10/sharing-our-safety-framework) describes hardware, driving behavior, and operational validation beyond this project's scope.

## Features

| Feature | Pillar / weight within pillar | Definition / purpose | Source and geography | Transform / direction | Concern | Priority |
|---|---|---|---|---|---|---|
| Annual precipitation | Familiarity / .20 | Wet-weather exposure proxy, mm/year | NOAA 1991–2020 stations | log1p / distance | Intensity and local variation hidden | P0 |
| Annual snowfall | Familiarity / .20 | Winter exposure proxy, mm/year | NOAA 1991–2020 stations | log1p / distance | Missing is not zero | P0 |
| Hot days | Familiarity / .20 | Days with maximum >=90°F / 32.2°C | NOAA stations | linear / distance | Extreme episodes hidden | P0 |
| Mean commute | Familiarity / .40 | Grouped travel-duration estimate, minutes | ACS B08303 / CBSA | linear / distance | Not measured traffic congestion | P0 |
| Public DC ports per 100k | Readiness / .70 | Charging quantity | AFDC points + ACS | log1p / higher | Public access is not secured fleet capacity | P0 |
| Population in counties with DC | Readiness / .30 | Coarse spread of infrastructure | AFDC + county populations | linear / higher | Not travel-time access | P0 |
| Population | Opportunity / .30 | Resident market-size proxy | ACS B01003 / CBSA | log1p / higher | Residents are not customers | P0 |
| Population density | Opportunity / .25 | Residents per land km² | ACS + Census land area | log1p / higher | Rural metro counties dilute values | P0 |
| Zero-vehicle household share | Opportunity / .30 | Households with no vehicle / all households | ACS B08201 / CBSA | linear / higher | Does not imply willingness to pay | P0 |
| Transit commuting share | Opportunity / .15 | Public transit commuters / workers | ACS B08301 / CBSA | linear / higher | Transit also competes; commute-only | P0 |
| Road density | Familiarity / not enabled | Drivable km per land area | OSM clipped network | log1p / distance | Extraction completeness | P1 |
| Intersection density | Familiarity / not enabled | Consolidated junctions per land area | OSM network | log1p / distance | Grade separation and divided roads | P1 |
| Fatal crash rate | Context only | Three-year annualized fatal crashes per 100k | FARS points/counties | Not scored | Not all crashes; no driving exposure denominator | P1 |
| Airport activity | Opportunity candidate | Annual enplanements | FAA airport records | log1p / higher | Catchments and access restrictions | P2 |
| Severe-weather frequency | Familiarity candidate | Events per area and period | NOAA Storm Events | distance | Reporting inconsistency | P2 |

Regulatory flags and data coverage are not numeric ranking features. No subjective political score. Missing legal review is unresolved, not permitted.

## Normalization

Transform each enabled measurement, then min-max scale using bounds frozen across the complete candidate/reference cohort. Clip to [0,1]. Do not refit when filtering or adjusting weights. Constant variables are removed globally; remaining within-pillar weights normalize. A pillar without any discriminating feature is unavailable.

Complete-case policy: missing any enabled, nonconstant feature leaves the candidate unranked. Incomplete selected references reject the request. No city-specific imputation or weight redistribution. Coverage is completeness, not statistical confidence.

Scores are relative to this release, not directly comparable across releases. Sort full precision, then city ID; display one decimal. Near ties are near ties, not meaningful separation guarantees.

## Familiarity

Weighted Euclidean RMS distance `d = sqrt(sum(w_j * (z_city_j - z_reference_j)^2))`. Similarity is `100*(1-d)`. Choose the nearest complete whole-reference vector. Never combine the best feature from different references. Show the nearest three unique vectors, excluding self-reference.

Default references require documented commercial operation, evidence and a date. Announced/testing categories remain distinct and must be explicitly enabled and selected for exploratory comparisons. Reference metros are excluded from the default candidate shortlist. A reference metro does not imply operator coverage across that entire metro.

P0 familiarity covers only climate and commuting proxies, not street topology or technical AV capability. Adding references may increase similarity. Mock reference records are illustrative, not verified operator status.

## Combination and explanations

Readiness and opportunity are weighted averages of normalized features, multiplied by 100. Default top-level weights are familiarity .40, readiness .20, opportunity .40. All feature and top-level weights are configuration.

Readiness/opportunity factor points sum to their pillar. Familiarity factors expose squared-distance components, not additive score points. Analyst templates use computed results and evidence links only. No LLM is active in P0.

## Limitations

ACS estimates have sampling uncertainty; margins of error belong in ingestion metadata. Public charging quantity and geographic spread are correlated. Demand proxies are correlated and not causal demand estimates. Weather normals omit current weather, and station means are not a spatial climate model. Eight metros are a small comparison cohort. These limitations remain part of the product story.
