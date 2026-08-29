-- PersonaChat v84: usage / premium / OSINT / capacity control-plane cutover.
-- Existing core tables are reused. This migration only adds indexes/columns
-- needed for the production control plane and leaves runtime opt-in.

ALTER TABLE public.generation_events
  ADD COLUMN IF NOT EXISTS latency_ms BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS osint_refreshes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS osint_cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS request_id TEXT;

ALTER TABLE public.quality_events
  ADD COLUMN IF NOT EXISTS request_id TEXT;

ALTER TABLE public.osint_refresh_log
  ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_generation_events_user_provider_created
  ON public.generation_events(user_id, provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_events_provider_created
  ON public.generation_events(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_events_user_created
  ON public.generation_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_reservations_user_expiry
  ON public.generation_reservations(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_capacity_leases_status_joined
  ON public.capacity_leases(status, joined_at);
CREATE INDEX IF NOT EXISTS idx_osint_facts_subject_status
  ON public.osint_facts(subject_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_osint_sources_fact_checked
  ON public.osint_sources(fact_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_osint_refresh_log_attempt
  ON public.osint_refresh_log(last_attempt_at);
CREATE INDEX IF NOT EXISTS idx_quality_events_created_issue
  ON public.quality_events(created_at DESC, issue_type);

-- Premium is represented by users.plan in the canonical user table.
-- Keep a constrained index for fast plan-based aggregation.
CREATE INDEX IF NOT EXISTS idx_users_plan_created
  ON public.users(plan, created_at DESC);
