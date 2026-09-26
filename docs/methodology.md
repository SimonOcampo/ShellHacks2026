# Public-data screening methodology

ODD Scout is a public-data market-screening method with hypothetical fleet operations. It does not measure AV safety, approve deployment, or reproduce a private operator's methodology. The features, transforms, and weights below are project assumptions.

## Current expanded model: `ranking.v2`

The expanded scoring model has 15 active variables: 9 Familiarity, 2 Readiness, and 4 Opportunity. `config/ranking.v2.json` is the model registry. Familiarity weights sum to 1.00; their conceptual grouping is climate 30%, travel pattern 20%, network density 20%, and road-class composition 30%.

| Pillar | Feature | Within-pillar weight | Transform |
|---|---|---:|---|
| Familiarity | `annual_precipitation_mm` | .10 | log1p |
| Familiarity | `annual_snowfall_mm` | .10 | log1p |
| Familiarity | `hot_days_32c` | .10 | linear |
| Familiarity | `mean_commute_minutes` | .20 | linear |
| Familiarity | `road_density_km_per_km2` | .10 | log1p |
| Familiarity | `intersection_density_per_km2` | .10 | log1p |
| Familiarity | `freeway_share` | .10 | linear |
| Familiarity | `arterial_share` | .10 | linear |
| Familiarity | `local_road_share` | .10 | linear |
| Readiness | `public_dc_ports_per_100k` | .70 | log1p |
| Readiness | `population_share_in_counties_with_dc` | .30 | linear |
| Opportunity | `population` | .30 | log1p |
| Opportunity | `population_density_per_km2` | .25 | log1p |
| Opportunity | `zero_vehicle_household_share` | .30 | linear |
| Opportunity | `transit_commute_share` | .15 | linear |

Pillar weights are Familiarity .40, Readiness .20, and Opportunity .40. Two additional road measurements, `average_aadt` and `lane_miles_per_km2`, are optional informational fields. They are not part of the feature registry, normalization bounds, ranking factors, or Expansion Score. They may be absent or null with an explicit missing reason. Missing is never zero.

The corrected `verified.v2` data release uses a single 2024 ACS commute method: `B08013_E001 / B08303_E001`. Both input universes exclude people who worked from home, and both input margins of error are retained in the source audit. This fixes the `verified.v1` source denominator and mixed-method issue without changing the `ranking.v2` registry, weights, or distance formula. The data version and frozen bounds change; historical scores remain tied to their original release. Input MOEs do not establish confidence intervals for the derived ratio or market score.

## Historical model: `ranking.v1`

The mock `ranking.v1` release records the original ten-variable methodology: four Familiarity climate/commute features, two Readiness features, and four Opportunity features. Its configuration and fixtures remain historical and immutable. The expanded road-network Familiarity variables belong to `ranking.v2`; do not relabel v1 results as v2.

## Normalization and complete cases

For a given data release and model version, the immutable release stores the feature registry, transformed-space bounds, and sorted canonical `normalization_cohort` IDs. The cohort contains every complete configured candidate and each enabled complete reference in that release. Incomplete candidates stay in the release as unranked records; incomplete references are ineligible and must be disabled before publication. No city outside the configured candidates and references contributes to bounds.

For each cohort measurement, apply its registry transform first. `linear` leaves the value unchanged; `log1p` requires a finite nonnegative source value and fails on invalid input. For each feature, calculate the minimum and maximum of those transformed cohort values, then normalize with `(transformed - lower) / (upper - lower)` and clip to [0,1]. Bounds are frozen with the release/model pair. A filter, selected city subset, reference selection, or changed pillar weights never refits bounds. `ranking.v1` and `ranking.v2` have separate feature registries and releases; a model/release mismatch is invalid.

When a feature's frozen lower and upper bounds are equal, the release records it as constant and the engine removes it globally from scoring. It is not assigned an arbitrary normalized value. The remaining feature weights within each pillar normalize consistently. No per-city feature imputation or weight redistribution occurs.

A candidate must have all 15 `ranking.v2` scoring measurements to receive a score. A missing required measurement makes it unranked; selected enabled references must be complete. There is no imputation or city-specific weight redistribution. The two optional informational road measurements do not affect completeness or rankability. Coverage measures feature completeness, not statistical confidence.

Familiarity uses the weighted Euclidean distance between the candidate's complete normalized 9-feature vector and each eligible reference's complete vector. Similarity is `100 * (1 - distance)`. Select the nearest whole reference vector; do not combine feature-by-feature matches. Exclude self-reference and disabled or ineligible references under the existing project rules.

Scores are relative to their release and are not directly comparable across releases. Sort by full-precision score, then city ID. Display rounding does not indicate meaningful separation between near ties.

## Interpretation limits

NOAA normals and station values are climate proxies. Commute time is not traffic congestion. Public charging is not secured fleet capacity. Population and transportation measures are not observed customer demand. Road classes are not a measure of driving behavior or technical capability. Legal evidence and data coverage stay outside the numeric score. Report source provenance, missingness, and assumptions with each release.
