import { setAiPaused } from "@/lib/server/runtime-control";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getDb, getDatabaseFilePath } from "@/lib/server/db";
import { getCurrentUser, isConfiguredAdmin } from "@/lib/server/session";
import { cookies } from "next/headers";
import { hashToken } from "@/lib/server/security";
import { enforceBodySize, readJsonBody, rateLimit, requireSameOrigin } from "@/lib/server/security";
import { usageLimits, estimateGenerationCost } from "@/lib/server/usage";

const MAX_BODY_BYTES = 32 * 1024;
const ACTIONS = new Set(["block_user", "unblock_user", "unpublish_bot", "publish_bot", "backup", "pause_ai", "resume_ai"]);

function deny() {
  return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (user && isConfiguredAdmin(user.id, user.email)) return user;

  // Recovery path: if a configured admin account was accidentally marked
  // blocked, getCurrentUser intentionally rejects its session. Admin actions
  // must still be able to recover that account. This path is restricted to
  // the configured admin identity and never grants ordinary users access.
  const token = (await cookies()).get("personachat_session")?.value;
  if (!token) return null;
  const row = getDb().prepare(`
    SELECT u.id, u.name, u.username, u.email, u.created_at AS createdAt,
           u.avatar, u.gender, u.plan, s.expires_at AS expiresAt
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=?
  `).get(hashToken(token)) as any;
  if (!row || Number(row.expiresAt) < Date.now()) return null;
  if (!isConfiguredAdmin(String(row.id), String(row.email || ""))) return null;
  return {
    id: String(row.id), name: String(row.name || ""), username: String(row.username || ""),
    email: String(row.email || ""), createdAt: Number(row.createdAt || 0),
    avatar: row.avatar ?? null,
    gender: row.gender === "female" || row.gender === "male" ? row.gender : null,
    plan: row.plan === "premium" ? "premium" : "free", isAdmin: true
  };
}

function audit(adminId: string, action: string, targetType: string | null, targetId: string | null, details: Record<string, unknown> = {}) {
  getDb().prepare(
    `INSERT INTO admin_audit_log (id, admin_user_id, action, target_type, target_id, details_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), adminId, action, targetType, targetId, JSON.stringify(details), Date.now());
}


function analytics() {
  const db = getDb();
  const now = Date.now();
  const day = 86_400_000;
  const since30 = now - 30 * day;
  const since14 = now - 14 * day;
  const dayRows = db.prepare(`
    SELECT date(created_at / 1000, 'unixepoch') AS day,
      COUNT(*) AS requests,
      COALESCE(SUM(prompt_tokens),0) AS promptTokens,
      COALESCE(SUM(completion_tokens),0) AS completionTokens,
      COALESCE(SUM(total_tokens),0) AS tokens,
      COALESCE(SUM(estimated_cost_usd),0) AS cost,
      COALESCE(SUM(CASE WHEN kind='regeneration' THEN 1 ELSE 0 END),0) AS regenerations,
      COALESCE(SUM(osint_refreshes),0) AS osintRefreshes,
      COALESCE(SUM(CASE WHEN osint_cache_hit=1 THEN 1 ELSE 0 END),0) AS osintCacheHits
    FROM generation_events WHERE created_at >= ? GROUP BY day ORDER BY day ASC
  `).all(since14) as any[];
  const planRows = db.prepare(`
    SELECT plan, COUNT(*) AS requests, COALESCE(SUM(total_tokens),0) AS tokens, COALESCE(SUM(estimated_cost_usd),0) AS cost, COUNT(DISTINCT user_id) AS users
    FROM generation_events WHERE created_at >= ? GROUP BY plan
  `).all(since30) as any[];
  const modelRows = db.prepare(`
    SELECT COALESCE(model,'unknown') AS model, provider, COUNT(*) AS requests, COALESCE(SUM(total_tokens),0) AS tokens, COALESCE(SUM(estimated_cost_usd),0) AS cost, AVG(NULLIF(latency_ms,0)) AS avgLatencyMs
    FROM generation_events WHERE created_at >= ? GROUP BY model, provider ORDER BY cost DESC
  `).all(since30) as any[];
  const topUsers = db.prepare(`
    SELECT u.id, u.name, u.username, u.plan,
      COUNT(g.id) AS requests, COALESCE(SUM(g.total_tokens),0) AS tokens, COALESCE(SUM(g.estimated_cost_usd),0) AS cost,
      COALESCE(SUM(CASE WHEN g.kind='regeneration' THEN 1 ELSE 0 END),0) AS regenerations,
      COALESCE(SUM(g.osint_refreshes),0) AS osintRefreshes
    FROM generation_events g JOIN users u ON u.id=g.user_id
    WHERE g.created_at >= ? GROUP BY u.id ORDER BY cost DESC LIMIT 12
  `).all(since30) as any[];
  const active = db.prepare(`SELECT COUNT(DISTINCT user_id) AS count FROM generation_events WHERE created_at >= ?`).get(since30) as any;
  const todayActive = db.prepare(`SELECT COUNT(DISTINCT user_id) AS count FROM generation_events WHERE created_at >= ?`).get(now - day) as any;
  const latencyRows = db.prepare(`SELECT latency_ms AS latency FROM generation_events WHERE created_at >= ? AND latency_ms > 0 ORDER BY latency_ms ASC`).all(since30) as any[];
  const latencies = latencyRows.map((r) => Number(r.latency)).filter(Number.isFinite);
  const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] : 0;
  const total30 = planRows.reduce((n, r) => n + Number(r.tokens), 0);
  const cost30 = planRows.reduce((n, r) => n + Number(r.cost), 0);
  const requests30 = planRows.reduce((n, r) => n + Number(r.requests), 0);
  const premium = planRows.find((r) => String(r.plan) === 'premium') || { requests:0, tokens:0, cost:0, users:0 };
  const avgTokensPerRequest = requests30 ? total30 / requests30 : 0;
  const avgCostPerActiveUser = Number(active?.count ?? 0) ? cost30 / Number(active.count) : 0;
  const avgPremiumCostPerUser = Number(premium.users ?? 0) ? Number(premium.cost) / Number(premium.users) : 0;
  const cacheEvents = db.prepare(`SELECT COALESCE(SUM(CASE WHEN osint_cache_hit=1 THEN 1 ELSE 0 END),0) AS hits, COALESCE(SUM(CASE WHEN osint_refreshes>0 THEN osint_refreshes ELSE 0 END),0) AS refreshes FROM generation_events WHERE created_at >= ?`).get(since30) as any;
  const osintOpportunities = Number(cacheEvents?.refreshes ?? 0);
  const osintHits = Number(cacheEvents?.hits ?? 0);
  const osintHitRate = (osintHits + osintOpportunities) ? osintHits / (osintHits + osintOpportunities) : 0;
  const inputPrice = Number(process.env.PERSONACHAT_INPUT_USD_PER_MILLION_TOKENS || 1.5);
  const outputPrice = Number(process.env.PERSONACHAT_OUTPUT_USD_PER_MILLION_TOKENS || 9);
  const liteInputPrice = Number(process.env.PERSONACHAT_LITE_INPUT_USD_PER_MILLION_TOKENS || 0.3);
  const liteOutputPrice = Number(process.env.PERSONACHAT_LITE_OUTPUT_USD_PER_MILLION_TOKENS || 2.5);
  const tavilyCreditPrice = Number(process.env.PERSONACHAT_TAVILY_USD_PER_CREDIT || 0.008);
  const supabaseBase = Number(process.env.PERSONACHAT_SUPABASE_FIXED_USD_MONTH || 25);
  const upstashPer100k = Number(process.env.PERSONACHAT_UPSTASH_USD_PER_100K_COMMANDS || 0.2);
  const targetMargin = Math.min(0.9, Math.max(0.5, Number(process.env.PERSONACHAT_TARGET_MARGIN || 0.7)));
  const observedPremiumPriceFloor = avgPremiumCostPerUser > 0 ? avgPremiumCostPerUser / (1 - targetMargin) : 0;
  const simpleTrafficShare = modelRows.length ? Number(modelRows.find((r) => String(r.model).includes('flash'))?.requests ?? 0) / Math.max(1, requests30) : 0;
  const recommendations: { severity: 'info'|'warn'|'good'; title: string; body: string }[] = [];
  if (avgTokensPerRequest > 1800) recommendations.push({ severity:'warn', title:'Tokens por resposta estão altos', body:`A média está em ${Math.round(avgTokensPerRequest).toLocaleString('pt-BR')} tokens por geração nos últimos 30 dias. Revise histórico enviado e tamanho do contexto antes de aumentar limites.` });
  else if (avgTokensPerRequest > 0) recommendations.push({ severity:'good', title:'Consumo de tokens controlado', body:`A média está em ${Math.round(avgTokensPerRequest).toLocaleString('pt-BR')} tokens por geração nos últimos 30 dias.` });
  if (Number(premium.users ?? 0) > 0 && Number(premium.cost) > 0 && observedPremiumPriceFloor > 0) recommendations.push({ severity:'info', title:'Preço mínimo observado do Premium', body:`Para uma margem alvo de ${Math.round(targetMargin*100)}%, o custo variável observado sugere pelo menos US$ ${observedPremiumPriceFloor.toFixed(2)}/mês antes de infraestrutura fixa.` });
  if (osintOpportunities > 0 && osintHitRate < 0.35) recommendations.push({ severity:'warn', title:'Cache de OSINT pode ser melhor', body:`A eficiência observada de cache está em ${(osintHitRate*100).toFixed(0)}%. Mais reaproveitamento pode reduzir chamadas Tavily e latência.` });
  if (p95 > 5000) recommendations.push({ severity:'warn', title:'P95 de geração está alto', body:`O P95 observado está em ${(p95/1000).toFixed(1)}s. Priorize reduzir retries, pesquisa prévia e tamanho de contexto.` });
  if (simpleTrafficShare > 0.6) recommendations.push({ severity:'info', title:'Vale testar Flash-Lite em tráfego simples', body:'Mais de 60% das gerações recentes estão no caminho Flash/fluxo simples. Um piloto com Flash-Lite pode reduzir custo sem alterar o modelo principal de tarefas complexas.' });
  return {
    generatedAt: now, windowDays: 30, daily: dayRows.map((r) => ({ day:String(r.day), requests:Number(r.requests), promptTokens:Number(r.promptTokens), completionTokens:Number(r.completionTokens), tokens:Number(r.tokens), cost:Number(r.cost), regenerations:Number(r.regenerations), osintRefreshes:Number(r.osintRefreshes), osintCacheHits:Number(r.osintCacheHits) })),
    plans: planRows.map((r) => ({ plan:String(r.plan), requests:Number(r.requests), tokens:Number(r.tokens), cost:Number(r.cost), users:Number(r.users) })),
    models: modelRows.map((r) => ({ model:String(r.model), provider:String(r.provider), requests:Number(r.requests), tokens:Number(r.tokens), cost:Number(r.cost), avgLatencyMs:Number(r.avgLatencyMs ?? 0) })),
    topUsers: topUsers.map((r) => ({ id:String(r.id), name:String(r.name || ''), username:String(r.username || ''), plan:String(r.plan), requests:Number(r.requests), tokens:Number(r.tokens), cost:Number(r.cost), regenerations:Number(r.regenerations), osintRefreshes:Number(r.osintRefreshes) })),
    activeUsers30d:Number(active?.count ?? 0), activeUsers24h:Number(todayActive?.count ?? 0), avgTokensPerRequest, avgCostPerActiveUser, avgPremiumCostPerUser, p95LatencyMs:p95, osintHitRate,
    finance: { geminiFlash:{ inputPerMillion:inputPrice, outputPerMillion:outputPrice }, geminiFlashLite:{ inputPerMillion:liteInputPrice, outputPerMillion:liteOutputPrice }, tavilyCreditPrice, supabaseBase, upstashPer100k, targetMargin, observedPremiumPriceFloor },
    recommendations,
  };
}

function stats() {
  const db = getDb();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const since = now - day;
  const week = now - 7 * day;

  const users = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new24h,
      SUM(CASE WHEN blocked_at IS NOT NULL THEN 1 ELSE 0 END) AS blocked,
      SUM(CASE WHEN blocked_at IS NULL THEN 1 ELSE 0 END) AS active
    FROM users
  `).get(since) as any;

  const bots = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN visibility='public' THEN 1 ELSE 0 END) AS public,
      SUM(CASE WHEN visibility='private' THEN 1 ELSE 0 END) AS private
    FROM user_bots b JOIN users u ON u.id=b.owner_id
    WHERE u.blocked_at IS NULL
  `).get() as any;

  const generations = db.prepare(`
    SELECT provider, COUNT(*) AS count, COALESCE(SUM(total_tokens),0) AS tokens,
           COALESCE(SUM(estimated_cost_usd),0) AS cost
    FROM generation_events WHERE created_at >= ? GROUP BY provider
  `).all(since) as any[];
  const errors = db.prepare(`SELECT COUNT(*) AS count FROM quality_events WHERE created_at >= ?`).get(since) as any;
  const providerErrors = db.prepare(`SELECT issue_type, COUNT(*) AS count FROM quality_events WHERE created_at >= ? AND issue_type LIKE 'provider_%' GROUP BY issue_type`).all(since) as any[];
  const reports = db.prepare(`SELECT status, COUNT(*) AS count FROM reports GROUP BY status`).all() as any[];
  const recentReports = db.prepare(`SELECT COUNT(*) AS count FROM reports WHERE created_at >= ?`).get(since) as any;
  const activeSessions = db.prepare(`
    SELECT COUNT(*) AS count FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.expires_at >= ? AND u.blocked_at IS NULL
  `).get(now) as any;
  const capacity = db.prepare(`SELECT SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status='waiting' THEN 1 ELSE 0 END) AS waiting FROM capacity_leases`).get() as any;
  const weeklyGenerations = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(estimated_cost_usd),0) AS cost, COALESCE(SUM(total_tokens),0) AS tokens
    FROM generation_events WHERE created_at >= ?
  `).get(week) as any;
  const tokenTotals = db.prepare(`
    SELECT COALESCE(SUM(total_tokens),0) AS allTimeTokens,
      COALESCE(SUM(CASE WHEN created_at >= ? THEN total_tokens ELSE 0 END),0) AS todayTokens,
      COALESCE(SUM(estimated_cost_usd),0) AS allTimeCost,
      COALESCE(SUM(CASE WHEN created_at >= ? THEN estimated_cost_usd ELSE 0 END),0) AS todayCost
    FROM generation_events
  `).get(since, since) as any;

  const freeLimit = usageLimits("free").dailyTokens;
  const premiumLimit = usageLimits("premium").dailyTokens;
  const globalLimit = usageLimits("free").globalDailyTokens;
  const inputPrice = Number(process.env.PERSONACHAT_INPUT_USD_PER_MILLION_TOKENS || 0);
  const outputPrice = Number(process.env.PERSONACHAT_OUTPUT_USD_PER_MILLION_TOKENS || 0);
  const globalDailyUsd = Number(process.env.PERSONACHAT_GLOBAL_DAILY_USD || 0);
  return {
    generatedAt: now,
    users: { total: Number(users?.total ?? 0), active: Number(users?.active ?? 0), new24h: Number(users?.new24h ?? 0), blocked: Number(users?.blocked ?? 0) },
    bots: { total: Number(bots?.total ?? 0), public: Number(bots?.public ?? 0), private: Number(bots?.private ?? 0) },
    activeSessions: Number(activeSessions?.count ?? 0),
    health: {
      activeCapacityLeases: Number(capacity?.active ?? 0),
      waitingCapacityLeases: Number(capacity?.waiting ?? 0),
      providerErrors24h: providerErrors.map((r) => ({ type: String(r.issue_type), count: Number(r.count) })),
      status: Number(errors?.count ?? 0) > 20 || Number(providerErrors.reduce((sum, r) => sum + Number(r.count), 0)) > 5 ? "attention" : "healthy"
    },
    reports: { recent24h: Number(recentReports?.count ?? 0), byStatus: Object.fromEntries(reports.map((r) => [String(r.status), Number(r.count)])) },
    ai: {
      last24h: generations.map((r) => ({ provider: String(r.provider), requests: Number(r.count), tokens: Number(r.tokens), estimatedCostUsd: Number(r.cost) })),
      last7d: { requests: Number(weeklyGenerations?.count ?? 0), tokens: Number(weeklyGenerations?.tokens ?? 0), estimatedCostUsd: Number(weeklyGenerations?.cost ?? 0) },
      qualityEvents24h: Number(errors?.count ?? 0),
      totalTokensAllTime: Number(tokenTotals?.allTimeTokens ?? 0),
      totalTokensToday: Number(tokenTotals?.todayTokens ?? 0),
      totalCostAllTimeUsd: Number(tokenTotals?.allTimeCost ?? 0),
      totalCostTodayUsd: Number(tokenTotals?.todayCost ?? 0),
      limits: { freeDailyTokens: freeLimit, premiumDailyTokens: premiumLimit, globalDailyTokens: globalLimit, globalDailyUsd },
      pricing: {
        inputUsdPerMillion: inputPrice, outputUsdPerMillion: outputPrice,
        freeDailyCostRangeUsd: { min: estimateGenerationCost(freeLimit, 0), max: estimateGenerationCost(0, freeLimit) }
      }
    }
  };
}
export async function GET(req: Request) {
  const limit = rateLimit(req, "admin-read", 30);
  if (!limit.allowed) return NextResponse.json({ error: "Muitas requisições." }, { status: 429 });
  const admin = await requireAdmin();
  if (!admin) return deny();

  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "overview";
  const db = getDb();

  if (view === "reports") {
    const rows = db.prepare(`
      SELECT r.id,r.target_type,r.target_id,r.reason,r.details,r.status,r.priority,
             r.created_at,r.updated_at,r.resolution_note,
             u.username AS reporter_username
      FROM reports r JOIN users u ON u.id=r.reporter_id
      ORDER BY r.created_at DESC LIMIT 200
    `).all() as any[];
    return NextResponse.json({ reports: rows });
  }

  if (view === "users") {
    const freeLimit = usageLimits("free").dailyTokens;
    const premiumLimit = usageLimits("premium").dailyTokens;
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const rows = db.prepare(`
      SELECT u.id,u.name,u.username,u.created_at AS createdAt,u.plan,
        u.blocked_at AS blockedAt,u.blocked_reason AS blockedReason,
        CASE WHEN u.plan='premium' THEN ? ELSE ? END AS dailyTokensLimit,
        COALESCE((SELECT SUM(g.total_tokens) FROM generation_events g WHERE g.user_id=u.id AND g.provider='gemini' AND g.created_at>=?),0) AS dailyTokensUsed,
        COALESCE((SELECT SUM(g.estimated_cost_usd) FROM generation_events g WHERE g.user_id=u.id AND g.provider='gemini' AND g.created_at>=?),0) AS dailyCostUsd
      FROM users u ORDER BY u.created_at DESC LIMIT 200
    `).all(premiumLimit, freeLimit, since, since) as any[];
    return NextResponse.json({ users: rows });
  }

  if (view === "bots") {
    const rows = db.prepare(`
      SELECT b.id,b.name,b.visibility,b.created_at AS createdAt,b.owner_id AS ownerId,
             u.name AS ownerName,u.username AS ownerUsername
      FROM user_bots b JOIN users u ON u.id=b.owner_id
      ORDER BY b.created_at DESC LIMIT 200
    `).all() as any[];
    return NextResponse.json({ bots: rows });
  }

  if (view === "analytics") return NextResponse.json({ analytics: analytics() });

  if (view === "audit") {
    const rows = db.prepare(`
      SELECT a.id,a.action,a.target_type AS targetType,a.target_id AS targetId,
             a.details_json AS detailsJson,a.created_at AS createdAt,
             u.username AS adminUsername
      FROM admin_audit_log a JOIN users u ON u.id=a.admin_user_id
      ORDER BY a.created_at DESC LIMIT 200
    `).all() as any[];
    return NextResponse.json({ audit: rows.map((r) => ({ ...r, details: JSON.parse(r.detailsJson || "{}") })) });
  }

  return NextResponse.json({ ok: true, stats: stats() });
}

export async function PATCH(req: Request) {
  const limit = rateLimit(req, "admin-write", 30);
  if (!limit.allowed) return NextResponse.json({ error: "Muitas ações em pouco tempo." }, { status: 429 });
  try {
    requireSameOrigin(req);
    enforceBodySize(req, MAX_BODY_BYTES);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "BODY_TOO_LARGE" ? "Requisição muito grande." : "Origem não permitida." }, { status: error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 403 });
  }

  const admin = await requireAdmin();
  if (!admin) return deny();

  const body = await readJsonBody<Record<string, unknown>>(req, MAX_BODY_BYTES);
  const action = String(body.action || "");
  const targetId = String(body.targetId || "").trim();
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Ação administrativa inválida." }, { status: 400 });

  const db = getDb();
  if (action === "pause_ai" || action === "resume_ai") {
    const paused = setAiPaused(action === "pause_ai");
    audit(admin.id, action, "system", "ai", { paused });
    return NextResponse.json({ ok: true, aiPaused: paused });
  }

  if (action === "backup") {
    try {
      const source = getDatabaseFilePath();
      if (!existsSync(source)) return NextResponse.json({ error: "Banco não encontrado." }, { status: 500 });
      const backupDir = path.join(path.dirname(source), "backups");
      mkdirSync(backupDir, { recursive: true });
      db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
      const filename = `personachat-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
      copyFileSync(source, path.join(backupDir, filename));
      audit(admin.id, "backup_created", "database", null, { filename });
      return NextResponse.json({ ok: true, backupCreated: true, filename, createdAt: Date.now() });
    } catch (error) {
      console.error("Admin backup failed:", error);
      return NextResponse.json({ error: "Não foi possível criar o backup." }, { status: 500 });
    }
  }

  if (!targetId) return NextResponse.json({ error: "Alvo obrigatório." }, { status: 400 });

  if (action === "block_user" || action === "unblock_user") {
    const target = db.prepare("SELECT id,username,name FROM users WHERE id=?").get(targetId) as any;
    if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    if (target.id === admin.id) return NextResponse.json({ error: "Você não pode bloquear a própria conta." }, { status: 400 });

    if (action === "block_user") {
      const reason = String(body.reason || "").trim().slice(0, 500);
      db.prepare("UPDATE users SET blocked_at=?, blocked_reason=? WHERE id=?").run(Date.now(), reason, targetId);
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(targetId);
      audit(admin.id, action, "user", targetId, { reason });
    } else {
      db.prepare("UPDATE users SET blocked_at=NULL, blocked_reason='' WHERE id=?").run(targetId);
      audit(admin.id, action, "user", targetId);
    }
    const updated = db.prepare("SELECT id, blocked_at AS blockedAt, blocked_reason AS blockedReason FROM users WHERE id=?").get(targetId) as any;
    return NextResponse.json({ ok: true, action, user: updated ? {
      id: String(updated.id), blockedAt: updated.blockedAt ?? null, blockedReason: updated.blockedReason ?? ""
    } : null });
  }

  if (action === "unpublish_bot" || action === "publish_bot") {
    const bot = db.prepare("SELECT id,name,owner_id,visibility FROM user_bots WHERE id=?").get(targetId) as any;
    if (!bot) return NextResponse.json({ error: "Personagem não encontrado." }, { status: 404 });
    if (action === "publish_bot") {
      const owner = db.prepare("SELECT blocked_at FROM users WHERE id=?").get(bot.owner_id) as any;
      if (owner?.blocked_at) return NextResponse.json({ error: "Não é possível publicar um personagem de uma conta bloqueada." }, { status: 400 });
    }
    db.prepare("UPDATE user_bots SET visibility=? WHERE id=?").run(action === "publish_bot" ? "public" : "private", targetId);
    audit(admin.id, action, "bot", targetId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação não executada." }, { status: 400 });
}
