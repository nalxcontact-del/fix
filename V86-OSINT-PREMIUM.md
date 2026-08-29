# v86 — Premium OSINT quality layer

This phase makes web research selective, source-aware, cost-aware, and production-compatible. Non-factual roleplay turns do not trigger Tavily. Fresh/news queries use freshness filters; deep questions use advanced search and extra content chunks. Basic search is 1 credit and deep search is 2 credits.

When the production control plane is enabled, OSINT refresh claims, fact reads/writes, and source provenance use Postgres. Local development retains the SQLite compatibility path.

The chat response includes a compact `osint` summary for future UI treatment: whether external knowledge was used, whether it was refreshed, whether cache satisfied it, source count, and the research reason. No API key or raw source content is exposed to the client.

Tavily current guidance: basic search costs 1 credit, advanced search costs 2 credits; `topic=news` with `days` or `time_range` can narrow freshness, and `chunks_per_source` can improve advanced retrieval. This implementation follows those controls while keeping the single-search-per-turn default for predictable cost.


## v86.2 verifier alignment
The phase86 check now targets the current `osintPlan` variable names used by the implementation; no runtime behavior was changed.
