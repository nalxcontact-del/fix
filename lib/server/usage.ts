export type UsageSnapshot = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type Provider = "gemini" | "groq";

export type UsageStatus = {
  plan: "free" | "premium";
  provider: Provider;
  limits: ReturnType<typeof usageLimits>;
  used: { dailyTokens: number; monthlyTokens: number; dailyCostUsd: number; regenerationsHour: number; regenerationsDay: number };
  regeneration: { hourLimit: number; dayLimit: number; hourUsed: number; dayUsed: number; hourRemaining: number; dayRemaining: number };
  dailyResetAt: number | null;
};

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MONTH_MS = 30 * DAY_MS;
const RESERVATION_MS = 3 * 60_000;

function envInt(name: string, fallback: number, min = 0) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(min, Math.floor(value)) : fallback;
}

function envFloat(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

export function usageLimits(plan: string | null | undefined) {
  const premium = plan === "premium";
  const betaDailyCap = 50_000;
  const betaGlobalCap = 250_000;
  return {
    dailyTokens: premium ? envInt("PERSONACHAT_PREMIUM_DAILY_TOKENS", 500_000) : Math.min(envInt("PERSONACHAT_FREE_DAILY_TOKENS", betaDailyCap), betaDailyCap),
    monthlyTokens: envInt(premium ? "PERSONACHAT_PREMIUM_MONTHLY_TOKENS" : "PERSONACHAT_FREE_MONTHLY_TOKENS", premium ? 5_000_000 : 500_000),
    globalDailyTokens: Math.min(envInt("PERSONACHAT_GLOBAL_DAILY_TOKENS", betaGlobalCap), betaGlobalCap),
  };
}

export function regenerationLimits(_plan: string | null | undefined) {
  const freeHour = envInt("PERSONACHAT_FREE_REGENERATIONS_PER_HOUR", 4);
  const freeDay = envInt("PERSONACHAT_FREE_REGENERATIONS_PER_DAY", 12);
  const premiumHour = envInt("PERSONACHAT_PREMIUM_REGENERATIONS_PER_HOUR", 8);
  const premiumDay = envInt("PERSONACHAT_PREMIUM_REGENERATIONS_PER_DAY", 24);
  return _plan === "premium" ? { hour: premiumHour, day: premiumDay } : { hour: freeHour, day: freeDay };
}

export function estimateTokensFromText(text: string) {
  return Math.max(1, Math.ceil(String(text ?? "").length / 4));
}

export function maxGenerationTokens() {
  return envInt("PERSONACHAT_MAX_ESTIMATED_GENERATION_TOKENS", 2_200, 1);
}

export function estimateGenerationCost(promptTokens: number, completionTokens: number) {
  const inputPerMillion = envFloat("PERSONACHAT_INPUT_USD_PER_MILLION_TOKENS", 0);
  const outputPerMillion = envFloat("PERSONACHAT_OUTPUT_USD_PER_MILLION_TOKENS", 0);
  return (promptTokens / 1_000_000) * inputPerMillion + (completionTokens / 1_000_000) * outputPerMillion;
}

function normalizeProvider(provider: string | null | undefined): Provider {
  return provider === "groq" ? "groq" : "gemini";
}

function sumTokens(db: { prepare: (sql: string) => { get: (...args: unknown[]) => unknown } }, where: string, args: unknown[]) {
  const row = db.prepare(`SELECT COALESCE(SUM(total_tokens), 0) AS total FROM generation_events WHERE ${where}`).get(...args) as { total?: number };
  return Number(row?.total ?? 0);
}

function countRegenerations(db: { prepare: (sql: string) => { get: (...args: unknown[]) => unknown } }, userId: string, since: number) {
  const row = db.prepare("SELECT COUNT(*) AS count FROM generation_events WHERE user_id=? AND kind='regeneration' AND created_at >= ?").get(userId, since) as { count?: number };
  const reservations = db.prepare("SELECT COUNT(*) AS count FROM generation_reservations WHERE user_id=? AND kind='regeneration' AND expires_at > ?").get(userId, Date.now()) as { count?: number };
  return Number(row?.count ?? 0) + Number(reservations?.count ?? 0);
}

export function checkRegenerationBudget(db: { prepare: (sql: string) => { get: (...args: unknown[]) => unknown } }, userId: string, plan: string | null | undefined, isAdmin = false) {
  if (isAdmin) return { allowed: true as const, ...regenerationLimits(plan), hourUsed: 0, dayUsed: 0 };
  const limits = regenerationLimits(plan);
  const now = Date.now();
  const hourUsed = countRegenerations(db, userId, now - HOUR_MS);
  const dayUsed = countRegenerations(db, userId, now - DAY_MS);
  if (hourUsed >= limits.hour) return { allowed: false as const, reason: "REGENERATION_HOUR_LIMIT", retryAfterSeconds: 3600, ...limits, hourUsed, dayUsed };
  if (dayUsed >= limits.day) return { allowed: false as const, reason: "REGENERATION_DAY_LIMIT", retryAfterSeconds: 86400, ...limits, hourUsed, dayUsed };
  return { allowed: true as const, ...limits, hourUsed, dayUsed };
}

export function reserveRegeneration(db: { exec: (sql: string) => unknown; prepare: (sql: string) => { run: (...args: unknown[]) => unknown; get: (...args: unknown[]) => unknown } }, userId: string, plan: string | null | undefined, isAdmin = false) {
  if (isAdmin) return { id: null, hourRemaining: Number.POSITIVE_INFINITY, dayRemaining: Number.POSITIVE_INFINITY };
  const limits = regenerationLimits(plan);
  const now = Date.now();
  const id = crypto.randomUUID();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM generation_reservations WHERE expires_at <= ?").run(now);
    const hourCompleted = Number((db.prepare("SELECT COUNT(*) AS count FROM generation_events WHERE user_id=? AND kind='regeneration' AND created_at >= ?").get(userId, now - HOUR_MS) as { count?: number })?.count ?? 0);
    const dayCompleted = Number((db.prepare("SELECT COUNT(*) AS count FROM generation_events WHERE user_id=? AND kind='regeneration' AND created_at >= ?").get(userId, now - DAY_MS) as { count?: number })?.count ?? 0);
    const hourReserved = Number((db.prepare("SELECT COUNT(*) AS count FROM generation_reservations WHERE user_id=? AND kind='regeneration' AND expires_at > ?").get(userId, now) as { count?: number })?.count ?? 0);
    const dayReserved = hourReserved;
    if (hourCompleted + hourReserved >= limits.hour) throw new Error("REGENERATION_HOUR_LIMIT");
    if (dayCompleted + dayReserved >= limits.day) throw new Error("REGENERATION_DAY_LIMIT");
    db.prepare("INSERT INTO generation_reservations (id,user_id,kind,created_at,expires_at) VALUES (?,?,?,?,?)")
      .run(id, userId, "regeneration", now, now + RESERVATION_MS);
    db.exec("COMMIT");
    return { id, hourRemaining: Math.max(0, limits.hour - hourCompleted - hourReserved - 1), dayRemaining: Math.max(0, limits.day - dayCompleted - dayReserved - 1) };
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* preserve original error */ }
    throw error;
  }
}

export function releaseGenerationReservation(db: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } }, id: string) {
  db.prepare("DELETE FROM generation_reservations WHERE id=?").run(id);
}

function dailyResetAtForUser(db: { prepare: (sql: string) => { get: (...args: unknown[]) => unknown; all?: (...args: unknown[]) => unknown[] } }, userId: string, provider: Provider, dailyLimit: number, estimatedTokens: number) {
  const now = Date.now();
  const dailySince = now - DAY_MS;
  const rows = (db.prepare("SELECT total_tokens AS totalTokens, created_at AS createdAt FROM generation_events WHERE user_id=? AND provider=? AND created_at>=? ORDER BY created_at ASC").all?.(userId, provider, dailySince) ?? []) as Array<{ totalTokens?: number; createdAt?: number }>;
  let remaining = rows.reduce((sum, row) => sum + Math.max(0, Number(row.totalTokens ?? 0)), 0);
  const allowedAfterRequest = Math.max(0, dailyLimit - estimatedTokens);
  for (const row of rows) {
    if (remaining <= allowedAfterRequest) return null;
    remaining -= Math.max(0, Number(row.totalTokens ?? 0));
    const createdAt = Number(row.createdAt ?? 0);
    if (createdAt > 0 && remaining <= allowedAfterRequest) return createdAt + DAY_MS;
  }
  return rows.length ? Number(rows[rows.length - 1].createdAt ?? now) + DAY_MS : now + DAY_MS;
}

export function checkGenerationBudget(db: { prepare: (sql: string) => { get: (...args: unknown[]) => unknown; all?: (...args: unknown[]) => unknown[] } }, userId: string, plan: string | null | undefined, estimatedTokens: number, provider: string | null | undefined = "gemini", isAdmin = false) {
  const limits = usageLimits(plan);
  if (isAdmin) return { allowed: true as const, provider: normalizeProvider(provider), limits, used: { userDaily: 0, userMonthly: 0, globalDaily: 0 }, retryAfterSeconds: 0, dailyResetAt: null as number | null };
  const activeProvider = normalizeProvider(provider);
  const now = Date.now();
  const dailySince = now - DAY_MS;
  const monthlySince = now - MONTH_MS;
  const userDaily = sumTokens(db, "user_id = ? AND provider = ? AND created_at >= ?", [userId, activeProvider, dailySince]);
  const userMonthly = sumTokens(db, "user_id = ? AND provider = ? AND created_at >= ?", [userId, activeProvider, monthlySince]);
  const globalDaily = sumTokens(db, "provider = ? AND created_at >= ?", [activeProvider, dailySince]);
  const estimatedCost = estimateGenerationCost(estimatedTokens, 0);
  const globalDailyCostLimit = envFloat("PERSONACHAT_GLOBAL_DAILY_USD", 0);
  const costRow = db.prepare("SELECT COALESCE(SUM(estimated_cost_usd), 0) AS total FROM generation_events WHERE provider = ? AND created_at >= ?").get(activeProvider, dailySince) as { total?: number };
  const globalDailyCost = Number(costRow?.total ?? 0);
  const dailyResetAt = dailyResetAtForUser(db, userId, activeProvider, limits.dailyTokens, estimatedTokens);
  const dailyRetryAfterSeconds = dailyResetAt ? Math.max(1, Math.ceil((dailyResetAt - now) / 1000)) : 86400;
  if (userDaily + estimatedTokens > limits.dailyTokens) return { allowed: false as const, reason: "USER_DAILY_LIMIT", retryAfterSeconds: dailyRetryAfterSeconds, dailyResetAt, provider: activeProvider, limits, used: { userDaily, userMonthly, globalDaily } };
  if (userMonthly + estimatedTokens > limits.monthlyTokens) return { allowed: false as const, reason: "USER_MONTHLY_LIMIT", retryAfterSeconds: 30 * 86400, dailyResetAt: null, provider: activeProvider, limits, used: { userDaily, userMonthly, globalDaily } };
  if (globalDaily + estimatedTokens > limits.globalDailyTokens) return { allowed: false as const, reason: "GLOBAL_DAILY_LIMIT", retryAfterSeconds: 86400, dailyResetAt: null, provider: activeProvider, limits, used: { userDaily, userMonthly, globalDaily } };
  if (globalDailyCostLimit > 0 && globalDailyCost + estimatedCost > globalDailyCostLimit) return { allowed: false as const, reason: "GLOBAL_DAILY_COST_LIMIT", retryAfterSeconds: 86400, dailyResetAt: null, provider: activeProvider, limits, used: { userDaily, userMonthly, globalDaily } };
  return { allowed: true as const, provider: activeProvider, limits, used: { userDaily, userMonthly, globalDaily }, retryAfterSeconds: 0, dailyResetAt: null as number | null };
}

export function getUsageStatus(db: { prepare: (sql: string) => { get: (...args: unknown[]) => unknown } }, userId: string, plan: string | null | undefined, provider: string | null | undefined = "gemini", isAdmin = false): UsageStatus {
  const normalizedPlan = plan === "premium" ? "premium" : "free";
  const activeProvider = normalizeProvider(provider);
  const limits = usageLimits(normalizedPlan);
  if (isAdmin) {
    const regenLimits = regenerationLimits(normalizedPlan);
    return {
      plan: normalizedPlan,
      provider: activeProvider,
      limits,
      used: { dailyTokens: 0, monthlyTokens: 0, dailyCostUsd: 0, regenerationsHour: 0, regenerationsDay: 0 },
      regeneration: { hourLimit: regenLimits.hour, dayLimit: regenLimits.day, hourUsed: 0, dayUsed: 0, hourRemaining: Number.POSITIVE_INFINITY, dayRemaining: Number.POSITIVE_INFINITY },
      dailyResetAt: null,
    };
  }
  const now = Date.now();
  const dailySince = now - DAY_MS;
  const monthlySince = now - MONTH_MS;
  const hourSince = now - HOUR_MS;
  const dailyTokens = sumTokens(db, "user_id=? AND provider=? AND created_at>=?", [userId, activeProvider, dailySince]);
  const monthlyTokens = sumTokens(db, "user_id=? AND provider=? AND created_at>=?", [userId, activeProvider, monthlySince]);
  const costRow = db.prepare("SELECT COALESCE(SUM(estimated_cost_usd),0) AS total FROM generation_events WHERE user_id=? AND provider=? AND created_at>=?").get(userId, activeProvider, dailySince) as { total?: number };
  const dailyCostUsd = Number(costRow?.total ?? 0);
  const regenerationsHour = countRegenerations(db, userId, hourSince);
  const regenerationsDay = countRegenerations(db, userId, dailySince);
  const regenLimits = regenerationLimits(normalizedPlan);
  const dailyResetAt = dailyTokens >= limits.dailyTokens ? dailyResetAtForUser(db, userId, activeProvider, limits.dailyTokens, 1) : null;
  return {
    plan: normalizedPlan,
    provider: activeProvider,
    limits,
    used: { dailyTokens, monthlyTokens, dailyCostUsd, regenerationsHour, regenerationsDay },
    regeneration: {
      hourLimit: regenLimits.hour, dayLimit: regenLimits.day, hourUsed: regenerationsHour, dayUsed: regenerationsDay,
      hourRemaining: Math.max(0, regenLimits.hour - regenerationsHour), dayRemaining: Math.max(0, regenLimits.day - regenerationsDay),
    },
    dailyResetAt,
  };
}

export function recordGeneration(db: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } }, event: {
  id: string;
  userId: string;
  characterId: string;
  kind: string;
  model: string;
  plan?: string;
  provider?: string;
  usage: UsageSnapshot;
  latencyMs?: number;
  osintRefreshes?: number;
  osintCacheHit?: boolean;
  requestId?: string;
}) {
  db.prepare(`INSERT INTO generation_events
    (id,user_id,character_id,kind,model,provider,plan,prompt_tokens,completion_tokens,total_tokens,estimated_cost_usd,latency_ms,osint_refreshes,osint_cache_hit,request_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(event.id, event.userId, event.characterId, event.kind, event.model, normalizeProvider(event.provider), event.plan === "premium" ? "premium" : "free", event.usage.promptTokens, event.usage.completionTokens, event.usage.totalTokens, event.usage.estimatedCostUsd, Math.max(0, Number(event.latencyMs ?? 0)), Math.max(0, Number(event.osintRefreshes ?? 0)), event.osintCacheHit ? 1 : 0, event.requestId ?? null, Date.now());
}

export function recordQualityIssues(db: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } }, issues: string[], mode: string, plan: string) {
  const now = Date.now();
  const stmt = db.prepare("INSERT INTO quality_events (id,issue_type,mode,plan,created_at) VALUES (?,?,?,?,?)");
  for (const issue of issues) stmt.run(crypto.randomUUID(), issue, mode, plan === "premium" ? "premium" : "free", now);
}

export function usageFromProviderResponse(data: any, fallbackPromptTokens: number, fallbackCompletionTokens: number): UsageSnapshot {
  const usage = data?.usage ?? data?.usageMetadata ?? {};
  const promptTokenValue = usage.prompt_tokens ?? usage.promptTokenCount ?? usage.input_tokens ?? fallbackPromptTokens;
  const completionTokenValue = usage.completion_tokens ?? usage.candidatesTokenCount ?? usage.output_tokens ?? fallbackCompletionTokens;
  const promptTokens = Number(promptTokenValue);
  const completionTokens = Number(completionTokenValue);
  const totalTokens = Number(usage.total_tokens ?? promptTokens + completionTokens);
  return {
    promptTokens: Number.isFinite(promptTokens) ? Math.max(0, promptTokens) : fallbackPromptTokens,
    completionTokens: Number.isFinite(completionTokens) ? Math.max(0, completionTokens) : fallbackCompletionTokens,
    totalTokens: Number.isFinite(totalTokens) ? Math.max(0, totalTokens) : fallbackPromptTokens + fallbackCompletionTokens,
    estimatedCostUsd: estimateGenerationCost(promptTokens, completionTokens),
  };
}
