# PersonaChat v79 — Production Foundation

This release consolidates the application-quality work and adds the production control plane.

## Runtime architecture

- Next.js application layer.
- Postgres/Supabase is the target production data plane.
- Supabase Storage is the target object/file layer.
- Upstash Redis REST is the target distributed rate-limit/cache layer.
- Gemini remains the generation provider.
- Tavily remains the Premium OSINT provider.

The current source keeps SQLite as a local-development compatibility layer while the production foundation is introduced. **Production must not be launched on SQLite.** Set `PERSONACHAT_REQUIRE_POSTGRES=1` and the app will fail closed when Postgres/Supabase credentials are missing. The full transactional SQLite→Postgres cutover remains a separate migration step because the existing data layer is synchronous; doing it in one blind refactor would be a regression risk.

## Supabase setup

1. Create a Supabase Postgres project. Supabase provides full Postgres plus Storage, and supports transaction-mode pooling for serverless application traffic. [Supabase docs](https://supabase.com/docs/guides/database/connecting-to-postgres).
2. Run `supabase/migrations/001_personachat_production_foundation.sql`.
3. Configure:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
   - `SUPABASE_STORAGE_BUCKET` (for example `personachat-media`)
   - `SUPABASE_STORAGE_PUBLIC_BASE_URL` when using a custom public storage URL.
4. Configure Upstash:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

Upstash supports distributed rate limiting and caching, including plan-specific limits and analytics.

## Cost instrumentation

The existing `generation_events` table remains the local source of truth for development. v79 additionally records production analytics for each generation and OSINT operation when Supabase is configured. Tracked dimensions include tokens, estimated USD cost, latency, plan, provider/model, OSINT refresh/cache usage and request id.

Set model pricing through:
- `PERSONACHAT_INPUT_USD_PER_MILLION_TOKENS`
- `PERSONACHAT_OUTPUT_USD_PER_MILLION_TOKENS`

Never hardcode provider pricing into the UI.

## Premium OSINT behavior

Premium OSINT is intentionally selective:
- non-current questions can use cached approved facts;
- fresh/current questions can refresh;
- instruction-shaped questions are rejected before provider calls;
- blocked/sensitive categories are never stored;
- source domains are diversified;
- only approved normalized facts enter roleplay context;
- OSINT itself never overrides the active roleplay.

The control plane records when OSINT actually refreshed versus when cached context was sufficient, so pricing can be based on observed consumption rather than guesses.
