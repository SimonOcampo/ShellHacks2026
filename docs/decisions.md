# Approved foundation and implementation decisions

The user approved implementation of the detailed plan on 2026-09-26.

1. Fixed CBSA metros for ranking; separate synthetic simulation zone.
2. Transparent .40/.20/.40 pillar weights and ten-variable P0 model.
3. Complete-case ranking, frozen normalization, nearest whole-reference Euclidean similarity.
4. Public charging-only readiness; legal flags outside scoring.
5. Seeded discrete-event fleet operations, finite chargers, explicit unfinished requests.
6. Pydantic-owned contracts and generated TypeScript in a monorepo.
7. Dark map-oriented dashboard, deterministic explanations in P0.
8. Vercel frontend and single Render backend, no database or queue.

## Implementation clarifications

- The runtime defaults to mock because no verified release exists. It never labels generated measurements as verified.
- Next.js 16 is used after the earlier major's resolved PostCSS dependency triggered advisories. Lockfiles pin the installed versions.
- Python package source mappings and editable paths are explicit for the nested monorepo.
- Fixture transport replays known defaults and disables scenario/ranking editing. Interactive calculations run through HTTP.
- API omitted weights read configuration. Direct pure-engine tests use explicit RankingRequest defaults.
- NOAA decoding and geographic joins remain official-data tasks, not fabricated approximations.
- The AFDC API uses its current `developer.nlr.gov` host.
- P1/P2 work is not started while verified P0 is incomplete.

## Forward path and rollback

There was no preexisting application, data, or deployed consumer. The initial contract is v1. Promote official data through an immutable release and matching environment variables. Preserve old releases and deployments; rollback changes the selection. Add compatible contract fields before migrating clients. No destructive migration or contract removal is authorized implicitly.
