import { getPostgres, isPostgresConfigured } from "./postgres";

export function isPostgresControlEnabled() {
  return process.env.PERSONACHAT_POSTGRES_CONTROL === "1" && isPostgresConfigured();
}

function pg() {
  if (!isPostgresControlEnabled()) throw new Error("POSTGRES_CONTROL_DISABLED");
  return getPostgres();
}

export type ControlGenerationEvent = {
  id: string; userId: string; characterId: string; kind: string; model: string | null;
  provider: string; plan: string; promptTokens: number; completionTokens: number;
  totalTokens: number; estimatedCostUsd: number; latencyMs?: number;
  osintRefreshes?: number; osintCacheHit?: boolean; requestId?: string; createdAt: number;
};

export async function getPostgresUsageStatus(userId: string, plan: "free" | "premium", provider = "gemini") {
  const db = pg();
  const now = Date.now();
  const dailySince = now - 86_400_000;
  const monthlySince = now - 30 * 86_400_000;
  const [daily, monthly, cost, regenHour, regenDay] = await Promise.all([
    db`SELECT COALESCE(SUM(total_tokens),0)::bigint AS total FROM generation_events WHERE user_id=${userId} AND provider=${provider} AND created_at>=${dailySince}`,
    db`SELECT COALESCE(SUM(total_tokens),0)::bigint AS total FROM generation_events WHERE user_id=${userId} AND provider=${provider} AND created_at>=${monthlySince}`,
    db`SELECT COALESCE(SUM(estimated_cost_usd),0)::numeric AS total FROM generation_events WHERE user_id=${userId} AND provider=${provider} AND created_at>=${dailySince}`,
    db`SELECT COUNT(*)::int AS count FROM generation_events WHERE user_id=${userId} AND provider=${provider} AND kind='regeneration' AND created_at>=${now-3_600_000}`,
    db`SELECT COUNT(*)::int AS count FROM generation_events WHERE user_id=${userId} AND provider=${provider} AND kind='regeneration' AND created_at>=${dailySince}`,
  ]);
  return {
    plan,
    provider,
    dailyTokens: Number(daily[0]?.total ?? 0),
    monthlyTokens: Number(monthly[0]?.total ?? 0),
    dailyCostUsd: Number(cost[0]?.total ?? 0),
    regenerationsHour: Number(regenHour[0]?.count ?? 0),
    regenerationsDay: Number(regenDay[0]?.count ?? 0),
  };
}

export async function recordPostgresGeneration(event: ControlGenerationEvent) {
  const db = pg();
  await db`INSERT INTO generation_events
    (id,user_id,character_id,kind,model,provider,plan,prompt_tokens,completion_tokens,total_tokens,estimated_cost_usd,latency_ms,osint_refreshes,osint_cache_hit,request_id,created_at)
    VALUES (${event.id},${event.userId},${event.characterId},${event.kind},${event.model},${event.provider},${event.plan},${event.promptTokens},${event.completionTokens},${event.totalTokens},${event.estimatedCostUsd},${event.latencyMs ?? 0},${event.osintRefreshes ?? 0},${Boolean(event.osintCacheHit)},${event.requestId ?? null},${event.createdAt})
    ON CONFLICT(id) DO UPDATE SET
      model=EXCLUDED.model,provider=EXCLUDED.provider,plan=EXCLUDED.plan,prompt_tokens=EXCLUDED.prompt_tokens,
      completion_tokens=EXCLUDED.completion_tokens,total_tokens=EXCLUDED.total_tokens,estimated_cost_usd=EXCLUDED.estimated_cost_usd,
      latency_ms=EXCLUDED.latency_ms,osint_refreshes=EXCLUDED.osint_refreshes,osint_cache_hit=EXCLUDED.osint_cache_hit,request_id=EXCLUDED.request_id`;
}

export async function recordPostgresQualityIssues(issues: string[], mode: string, plan: string, createdAt = Date.now()) {
  const db = pg();
  await db.begin(async (tx) => {
    for (const issue of issues) {
      await tx`INSERT INTO quality_events(id,issue_type,mode,plan,created_at) VALUES(${crypto.randomUUID()},${issue},${mode},${plan === "premium" ? "premium" : "free"},${createdAt})`;
    }
  });
}

export async function getPostgresCapacityRows() {
  const db = pg();
  return db`SELECT user_id,status,joined_at,granted_at,last_seen_at FROM capacity_leases ORDER BY joined_at ASC`;
}

export async function upsertPostgresCapacity(userId: string, status: "waiting" | "active", joinedAt: number, grantedAt: number | null, lastSeenAt: number) {
  const db = pg();
  await db`INSERT INTO capacity_leases(user_id,status,joined_at,granted_at,last_seen_at)
    VALUES(${userId},${status},${joinedAt},${grantedAt},${lastSeenAt})
    ON CONFLICT(user_id) DO UPDATE SET status=EXCLUDED.status,joined_at=EXCLUDED.joined_at,granted_at=EXCLUDED.granted_at,last_seen_at=EXCLUDED.last_seen_at`;
}

export async function deletePostgresCapacity(userId: string) {
  const db = pg();
  await db`DELETE FROM capacity_leases WHERE user_id=${userId}`;
}

export async function loadPostgresOsintFacts(subjectId: string, now = Date.now()) {
  const db = pg();
  return db`SELECT f.id,f.subject_id,f.category,f.fact_text,f.confidence,f.source_count,
      f.source_last_verified_at,f.expires_at,f.status,
      COALESCE((SELECT array_agg(s.source_domain ORDER BY s.checked_at DESC) FROM osint_sources s WHERE s.fact_id=f.id), ARRAY[]::text[]) AS source_domains
    FROM osint_facts f WHERE f.subject_id=${subjectId} AND f.subject_type='real_public_figure' AND f.status='active'
      AND (f.expires_at IS NULL OR f.expires_at>${now}) ORDER BY f.updated_at DESC LIMIT 40`;
}

export async function claimPostgresOsintRefresh(subjectId: string, now: number, dailyCredits: number, requestedCredits: number, cooldownMs: number) {
  const db = pg();
  return db.begin(async (tx) => {
    const existing = await tx`SELECT last_attempt_at FROM osint_refresh_log WHERE subject_id=${subjectId} FOR UPDATE`;
    const lastAttemptAt = Number(existing[0]?.last_attempt_at ?? 0);
    if (existing.length && now - lastAttemptAt < cooldownMs) return false;
    const since = now - 86_400_000;
    const usage = await tx`SELECT COALESCE(SUM(credits_used),0)::int AS total FROM osint_refresh_log WHERE last_success_at >= ${since}`;
    if (Number(usage[0]?.total ?? 0) + requestedCredits > dailyCredits) return false;
    await tx`INSERT INTO osint_refresh_log(subject_id,last_attempt_at,last_success_at,credits_used,last_error)
      VALUES(${subjectId},${now},NULL,0,NULL)
      ON CONFLICT(subject_id) DO UPDATE SET last_attempt_at=EXCLUDED.last_attempt_at,last_error=NULL`;
    return true;
  });
}

export async function upsertPostgresOsintFact(fact: {
  id: string; subjectId: string; category: string; factText: string; confidence: string;
  sourceCount: number; sourceLastVerifiedAt: number | null; expiresAt: number | null; status: string;
  createdAt: number; updatedAt: number; sourceDomain: string; sourceKind: string; reliability: string; checkedAt: number;
}) {
  const db = pg();
  await db.begin(async (tx) => {
    await tx`INSERT INTO osint_facts(id,subject_id,subject_type,category,fact_text,confidence,source_count,source_last_verified_at,expires_at,status,created_at,updated_at)
      VALUES(${fact.id},${fact.subjectId},'real_public_figure',${fact.category},${fact.factText},${fact.confidence},${fact.sourceCount},${fact.sourceLastVerifiedAt},${fact.expiresAt},${fact.status},${fact.createdAt},${fact.updatedAt})
      ON CONFLICT(id) DO UPDATE SET category=EXCLUDED.category,fact_text=EXCLUDED.fact_text,confidence=EXCLUDED.confidence,source_count=EXCLUDED.source_count,source_last_verified_at=EXCLUDED.source_last_verified_at,expires_at=EXCLUDED.expires_at,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at`;
    await tx`INSERT INTO osint_sources(id,fact_id,source_domain,source_kind,reliability,checked_at)
      VALUES(${crypto.randomUUID()},${fact.id},${fact.sourceDomain},${fact.sourceKind},${fact.reliability},${fact.checkedAt})`;
  });
}


export async function addPostgresOsintSources(factId: string, sources: Array<{ domain: string; reliability: string; sourceKind?: string; checkedAt: number }>) {
  const db = pg();
  for (const source of sources) {
    await db`INSERT INTO osint_sources(id,fact_id,source_domain,source_kind,reliability,checked_at)
      VALUES(${crypto.randomUUID()},${factId},${source.domain},${source.sourceKind ?? "tavily_search"},${source.reliability},${source.checkedAt})`;
  }
}

export async function upsertPostgresOsintRefreshLog(subjectId: string, lastAttemptAt: number, lastSuccessAt: number | null, creditsUsed: number, lastError: string | null) {
  const db = pg();
  await db`INSERT INTO osint_refresh_log(subject_id,last_attempt_at,last_success_at,credits_used,last_error)
    VALUES(${subjectId},${lastAttemptAt},${lastSuccessAt},${creditsUsed},${lastError})
    ON CONFLICT(subject_id) DO UPDATE SET last_attempt_at=EXCLUDED.last_attempt_at,last_success_at=EXCLUDED.last_success_at,credits_used=EXCLUDED.credits_used,last_error=EXCLUDED.last_error`;
}
