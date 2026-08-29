type AnalyticsEvent = {
  eventType: string;
  userId?: string;
  characterId?: string;
  plan?: string;
  provider?: string;
  model?: string;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd?: number;
  latencyMs?: number;
  osintRefreshes?: number;
  osintCacheHit?: boolean;
  requestId?: string;
  metadata?: Record<string, unknown>;
};

function configured() {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

async function insert(table: string, payload: Record<string, unknown>) {
  if (!configured()) return false;
  const url = `${process.env.SUPABASE_URL!.replace(/\/$/, "")}/rest/v1/${table}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`SUPABASE_ANALYTICS_${response.status}`);
  return true;
}

export async function recordProductionGenerationEvent(event: AnalyticsEvent) {
  try {
    return await insert("pc_generation_events", {
      event_type: event.eventType,
      user_id: event.userId ?? null,
      character_id: event.characterId ?? null,
      plan: event.plan ?? null,
      provider: event.provider ?? null,
      model: event.model ?? null,
      prompt_tokens: Math.max(0, Number(event.promptTokens ?? 0)),
      completion_tokens: Math.max(0, Number(event.completionTokens ?? 0)),
      total_tokens: Math.max(0, Number(event.totalTokens ?? 0)),
      estimated_cost_usd: Math.max(0, Number(event.estimatedCostUsd ?? 0)),
      latency_ms: Math.max(0, Number(event.latencyMs ?? 0)),
      osint_refreshes: Math.max(0, Number(event.osintRefreshes ?? 0)),
      osint_cache_hit: Boolean(event.osintCacheHit),
      request_id: event.requestId ?? null,
      metadata: event.metadata ?? {},
    });
  } catch (error) {
    console.error("Production analytics write failed:", error);
    return false;
  }
}

export async function recordProductionOsintEvent(event: {
  userId?: string;
  characterId: string;
  plan: string;
  questionFresh: boolean;
  refreshed: boolean;
  cacheHit: boolean;
  creditsUsed: number;
  resultCount: number;
  latencyMs: number;
  requestId?: string;
  reason?: string;
}) {
  try {
    return await insert("pc_osint_events", {
      user_id: event.userId ?? null,
      character_id: event.characterId,
      plan: event.plan,
      question_fresh: event.questionFresh,
      refreshed: event.refreshed,
      cache_hit: event.cacheHit,
      credits_used: Math.max(0, Math.floor(event.creditsUsed)),
      result_count: Math.max(0, Math.floor(event.resultCount)),
      latency_ms: Math.max(0, Math.floor(event.latencyMs)),
      request_id: event.requestId ?? null,
      reason: event.reason ?? null,
    });
  } catch (error) {
    console.error("Production OSINT analytics write failed:", error);
    return false;
  }
}
