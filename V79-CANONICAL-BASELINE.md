# PersonaChat v79 — Canonical Production Foundation

This version is intended to become the single source baseline after one-time dependency installation on the validated production tree.

Included and preserved from v78:
- Home single-scroll desktop
- mobile composer/safe-area work
- streaming stability
- isolated drafts and async chat state
- conversation concurrency hardening
- OSINT quality and safety filters
- deep audit hardening

Production foundation added:
- Next.js 16.3.3 target
- Postgres/Supabase control-plane integration
- Supabase Storage integration for image data when configured
- Upstash distributed rate-limit layer with local fallback
- per-generation cost/latency instrumentation
- per-OSINT refresh/cache telemetry
- production fail-closed guard against shipping SQLite accidentally

The full transactional cutover of every existing table from SQLite to Postgres is deliberately not performed in this source build because the current application database API is synchronous. That cutover should be done as its own controlled refactor after this baseline is validated; doing it implicitly here would be the exact kind of broad regression we have been avoiding.
