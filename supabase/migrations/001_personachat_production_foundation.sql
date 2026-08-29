-- PersonaChat Production Foundation
-- Run this in the Supabase SQL editor before enabling production analytics.
-- Core application tables remain on the existing SQLite database until the
-- dedicated Postgres cutover migration is completed. These tables are the
-- production telemetry/control plane and are safe to adopt first.

create table if not exists public.pc_generation_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  user_id text,
  character_id text,
  plan text,
  provider text,
  model text,
  prompt_tokens bigint not null default 0,
  completion_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  estimated_cost_usd numeric(18,8) not null default 0,
  latency_ms bigint not null default 0,
  osint_refreshes integer not null default 0,
  osint_cache_hit boolean not null default false,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists pc_generation_events_user_created_idx on public.pc_generation_events(user_id, created_at desc);
create index if not exists pc_generation_events_created_idx on public.pc_generation_events(created_at desc);

create table if not exists public.pc_osint_events (
  id bigint generated always as identity primary key,
  user_id text,
  character_id text not null,
  plan text not null,
  question_fresh boolean not null default false,
  refreshed boolean not null default false,
  cache_hit boolean not null default false,
  credits_used integer not null default 0,
  result_count integer not null default 0,
  latency_ms bigint not null default 0,
  request_id text,
  reason text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists pc_osint_events_character_created_idx on public.pc_osint_events(character_id, created_at desc);
create index if not exists pc_osint_events_created_idx on public.pc_osint_events(created_at desc);

create table if not exists public.pc_rate_limit_events (
  id bigint generated always as identity primary key,
  key_name text not null,
  identifier_hash text not null,
  allowed boolean not null,
  retry_after_seconds integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists pc_rate_limit_events_created_idx on public.pc_rate_limit_events(created_at desc);

-- Keep telemetry server-only. Do not expose these tables through the client.
alter table public.pc_generation_events enable row level security;
alter table public.pc_osint_events enable row level security;
alter table public.pc_rate_limit_events enable row level security;
