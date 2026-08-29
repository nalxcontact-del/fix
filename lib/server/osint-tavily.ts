import type { Character } from "@/lib/types";
import { getDb } from "@/lib/server/db";
import { isFactAllowedByPolicy, type OsintFact, type OsintFactCategory, type OsintConfidence, selectOsintFactsForRoleplay } from "@/lib/server/osint-policy";
import { recordProductionOsintEvent } from "@/lib/server/production-analytics";
import { isPostgresControlEnabled, loadPostgresOsintFacts, claimPostgresOsintRefresh, upsertPostgresOsintFact, addPostgresOsintSources, upsertPostgresOsintRefreshLog } from "@/lib/server/postgres-control";

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const DEFAULT_DAILY_CREDITS = 20;
const SUBJECT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_RESULTS = 8;
const MAX_FACT_CHARS = 900;
const REQUEST_TIMEOUT_MS = 8_000;
const DEEP_QUERY_CREDITS = 2;
const BASIC_QUERY_CREDITS = 1;
const FACTUAL_QUERY_PATTERN = /(?:^|\s)(who|what|when|where|why|how|tell me about|known for|career|works|filmography|discography|latest|recent|today|yesterday|this week|this month|current|new|recently|biography|project|interview|release|album|film|movie|show|tour|award|bio|age|born|conhecid|carreira|obra|últim|ultimo|recente|hoje|ontem|atual|projeto|entrevista|lançou|lancou|filme|série|serie|álbum|album|idade|nasc|biografia)\b/i;
const EXTERNAL_INSTRUCTION_PATTERN = /(?:ignore\s+(?:all\s+)?previous\s+instructions|disregard\s+(?:the\s+)?system\s+prompt|system\s+message\s*:|developer\s+message\s*:|assistant\s+message\s*:|reveal\s+(?:the\s+)?(?:system|developer)\s+prompt|follow\s+these\s+instructions|jailbreak|prompt\s+injection)/i;

const BLOCKED_TEXT = /\b(address|endereço|telefone|phone|email|e-mail|documento|document|passport|passaporte|medical|médic|saúde|health|diagnos|hospital|prescription|prescrição|home address|residência|live location|localização em tempo real|private|privado|intimate|íntimo|nude|nudes|sexual|sex life|vida sexual|minor|menor de idade)\b/i;
const WORK_SIGNALS = /\b(film|filme|filmography|filmografia|series|série|album|álbum|song|música|book|livro|novel|romance|award|prêmio|obra|works|discography|discografia|show|television|televisão|director|diretor|actor|atriz|ator)\b/i;
const CAREER_SIGNALS = /\b(actor|atriz|ator|singer|cantor|cantora|director|diretor|writer|escritor|escritora|producer|produtor|career|carreira|profession|profissão|born|nasc|known for|conhecid[oa] por)\b/i;
const CURRENT_SIGNALS = /\b(latest|recent|today|yesterday|this week|this month|current|new|recently|2026|agora|hoje|ontem|recente|atual|lançou|lancou|novo|nova)\b/i;
const INSTRUCTION_SHAPED_QUERY = /(?:ignore\s+(?:all\s+)?previous\s+instructions|disregard\s+(?:the\s+)?system\s+prompt|system\s+message\s*:|developer\s+message\s*:|jailbreak|prompt\s+injection|reveal\s+(?:the\s+)?(?:system|developer)\s+prompt)/i;

const HIGH_RELIABILITY = new Set([
  "wikipedia.org", "britannica.com", "imdb.com", "officialcharts.com", "grammy.com", "oscars.org",
  "nasa.gov", "gov.br", "gov.uk", "whitehouse.gov"
]);
const MEDIUM_RELIABILITY = new Set([
  "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "theguardian.com", "nytimes.com", "washingtonpost.com",
  "variety.com", "hollywoodreporter.com", "billboard.com", "rollingstone.com", "forbes.com"
]);

export type TavilySearchResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
};

function envInt(name: string, fallback: number, min = 0, max = 100000) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sourceReliability(url: string): "high" | "medium" | "low" {
  const host = hostFromUrl(url);
  if (!host) return "low";
  for (const domain of HIGH_RELIABILITY) if (host === domain || host.endsWith(`.${domain}`)) return "high";
  for (const domain of MEDIUM_RELIABILITY) if (host === domain || host.endsWith(`.${domain}`)) return "medium";
  return "low";
}

function cleanText(value: unknown, max = MAX_FACT_CHARS) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

function categoryForResult(result: TavilySearchResult): OsintFactCategory {
  const text = `${result.title ?? ""} ${result.content ?? ""}`;
  if (WORK_SIGNALS.test(text)) return "works";
  if (CAREER_SIGNALS.test(text)) return "career";
  return "public_biography";
}

function normalizeFact(result: TavilySearchResult) {
  const title = cleanText(result.title, 180);
  const content = cleanText(result.content);
  if (!title || !content || BLOCKED_TEXT.test(content) || BLOCKED_TEXT.test(title) || EXTERNAL_INSTRUCTION_PATTERN.test(content) || EXTERNAL_INSTRUCTION_PATTERN.test(title)) return null;
  const url = String(result.url ?? "").trim();
  const reliability = sourceReliability(url);
  if (reliability === "low") return null;
  const score = Number(result.score ?? 0);
  if (reliability === "medium" && score > 0 && score < 0.45) return null;
  const factText = `${title}: ${content}`.slice(0, MAX_FACT_CHARS);
  return {
    category: categoryForResult(result),
    factText,
    sourceDomain: hostFromUrl(url),
    reliability,
    score: Number.isFinite(score) ? score : 0,
  } as const;
}

type ParsedOsintFact = OsintFact & { sourceDomain: string; sourceReliability: "high" | "medium" | "low"; sourceDomains: string[] };

export function parseTavilyResults(results: TavilySearchResult[], subjectId: string, now = Date.now()): ParsedOsintFact[] {
  const grouped = new Map<string, ParsedOsintFact & { domains: Set<string> }>();
  for (const result of results.slice(0, MAX_RESULTS)) {
    const normalized = normalizeFact(result);
    if (!normalized) continue;
    const key = normalized.factText.toLocaleLowerCase().replace(/\s+/g, " ").slice(0, 280);
    const existing = grouped.get(key);
    if (existing) {
      existing.sourceCount += 1;
      existing.domains.add(normalized.sourceDomain);
      existing.sourceDomains = [...new Set(existing.sourceDomains.concat(normalized.sourceDomain))].slice(0, 5);
      if (normalized.reliability === "high") existing.confidence = "high";
      continue;
    }
    const confidence = normalized.reliability === "high" ? "high" : normalized.reliability === "medium" ? "medium" : "low";
    grouped.set(key, {
      id: crypto.randomUUID(),
      subjectId,
      category: normalized.category,
      factText: normalized.factText,
      confidence,
      sourceCount: 1,
      sourceLastVerifiedAt: now,
      expiresAt: now + CACHE_TTL_MS,
      status: "active",
      sourceDomain: normalized.sourceDomain,
      sourceReliability: normalized.reliability,
      domains: new Set([normalized.sourceDomain]),
      sourceDomains: [normalized.sourceDomain],
    });
  }
  const candidates = [...grouped.values()];
  const diversified: ParsedOsintFact[] = [];
  const domainCounts = new Map<string, number>();
  for (const fact of candidates.sort((a, b) => {
    const confidence = (x: OsintConfidence) => x === "high" ? 3 : x === "medium" ? 2 : 1;
    return confidence(b.confidence) - confidence(a.confidence) || b.sourceCount - a.sourceCount;
  })) {
    const count = domainCounts.get(fact.sourceDomain) ?? 0;
    if (count >= 2) continue;
    domainCounts.set(fact.sourceDomain, count + 1);
    const { domains, ...withoutDomains } = fact;
    void domains;
    diversified.push({ ...withoutDomains, sourceDomains: fact.sourceDomains });
    if (diversified.length >= MAX_RESULTS) break;
  }
  return diversified;
}

function claimRefresh(subjectId: string, now: number, dailyLimit: number, requestedCredits: number) {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT last_attempt_at FROM osint_refresh_log WHERE subject_id=?").get(subjectId) as { last_attempt_at?: number } | undefined;
    if (row && now - Number(row.last_attempt_at ?? 0) < SUBJECT_COOLDOWN_MS) {
      db.exec("ROLLBACK");
      return false;
    }
    const since = now - 24 * 60 * 60 * 1000;
    const usage = db.prepare("SELECT COALESCE(SUM(credits_used),0) AS total FROM osint_refresh_log WHERE last_success_at >= ?").get(since) as { total?: number };
    if (Number(usage?.total ?? 0) + requestedCredits > dailyLimit) {
      db.exec("ROLLBACK");
      return false;
    }
    db.prepare(`INSERT INTO osint_refresh_log(subject_id,last_attempt_at,last_success_at,credits_used,last_error)
      VALUES(?,?,?,?,?)
      ON CONFLICT(subject_id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, last_error=NULL`).run(subjectId, now, null, 0, null);
    db.exec("COMMIT");
    return true;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

function recordAttempt(subjectId: string, now: number, error: string | null, success: boolean) {
  const db = getDb();
  db.prepare(`INSERT INTO osint_refresh_log(subject_id,last_attempt_at,last_success_at,credits_used,last_error)\n    VALUES(?,?,?,?,?)\n    ON CONFLICT(subject_id) DO UPDATE SET\n      last_attempt_at=excluded.last_attempt_at,\n      last_success_at=CASE WHEN excluded.last_success_at IS NOT NULL THEN excluded.last_success_at ELSE osint_refresh_log.last_success_at END,\n      credits_used=CASE WHEN excluded.last_success_at IS NOT NULL THEN osint_refresh_log.credits_used + excluded.credits_used ELSE osint_refresh_log.credits_used END,\n      last_error=excluded.last_error`).run(subjectId, now, success ? now : null, success ? 1 : 0, error?.slice(0, 240) ?? null);
}

async function storeFacts(subjectId: string, facts: ParsedOsintFact[], now: number) {
  const allowed = facts.filter((fact) => isFactAllowedByPolicy(fact, now));
  if (!allowed.length) return;
  if (isPostgresControlEnabled()) {
    for (const fact of allowed) {
      const domains = (fact.sourceDomains ?? [fact.sourceDomain]).slice(0, 5);
      await upsertPostgresOsintFact({
        id: fact.id, subjectId, category: fact.category, factText: fact.factText, confidence: fact.confidence,
        sourceCount: fact.sourceCount, sourceLastVerifiedAt: fact.sourceLastVerifiedAt ?? now, expiresAt: fact.expiresAt ?? now + CACHE_TTL_MS,
        status: fact.status, createdAt: now, updatedAt: now, sourceDomain: domains[0] ?? fact.sourceDomain, sourceKind: "tavily_search", reliability: fact.sourceReliability, checkedAt: now,
      });
      if (domains.length > 1) await addPostgresOsintSources(fact.id, domains.slice(1).map((domain) => ({ domain, reliability: fact.sourceReliability, checkedAt: now })));
    }
    return;
  }
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const insertFact = db.prepare(`INSERT INTO osint_facts
      (id,subject_id,subject_type,category,fact_text,confidence,source_count,source_last_verified_at,expires_at,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,'active',?,?)`);
    const insertSource = db.prepare(`INSERT INTO osint_sources
      (id,fact_id,source_domain,source_kind,reliability,checked_at) VALUES(?,?,?,?,?,?)`);
    for (const fact of allowed) {
      insertFact.run(fact.id, subjectId, "real_public_figure", fact.category, fact.factText, fact.confidence, fact.sourceCount, fact.sourceLastVerifiedAt ?? now, fact.expiresAt ?? now + CACHE_TTL_MS, now, now);
      for (const domain of (fact.sourceDomains ?? [fact.sourceDomain]).slice(0, 5)) insertSource.run(crypto.randomUUID(), fact.id, domain, "tavily_search", fact.sourceReliability, now);
    }
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

export type OsintResearchPlan = {
  shouldSearch: boolean;
  deep: boolean;
  topic: "general" | "news";
  days?: number;
  timeRange?: "day" | "week" | "month" | "year";
  credits: number;
  reason: "NOT_FACTUAL" | "FRESH_SIMPLE" | "FRESH_DEEP" | "WORKS" | "CAREER" | "BIOGRAPHY";
};

export function classifyOsintRequest(question: string): OsintResearchPlan {
  const text = cleanText(question, 420);
  if (!text || !FACTUAL_QUERY_PATTERN.test(text)) return { shouldSearch: false, deep: false, topic: "general", credits: 0, reason: "NOT_FACTUAL" };
  const fresh = CURRENT_SIGNALS.test(text);
  const deep = /\b(why|what happened|what led|break down|in depth|deep|explore|compare|interview|what are people saying|controversy|timeline)\b/i.test(text);
  const works = WORK_SIGNALS.test(text);
  const career = CAREER_SIGNALS.test(text);
  const reason = fresh && deep ? "FRESH_DEEP" : fresh ? "FRESH_SIMPLE" : works ? "WORKS" : career ? "CAREER" : "BIOGRAPHY";
  const news = fresh || /\b(news|notícia|noticias|notícias|reporting|reported|announcement|announced)\b/i.test(text);
  return {
    shouldSearch: true, deep: deep, topic: news ? "news" : "general",
    days: news ? (deep ? 14 : 7) : undefined,
    timeRange: fresh && !news ? (deep ? "month" : "week") : undefined,
    credits: deep ? DEEP_QUERY_CREDITS : BASIC_QUERY_CREDITS,
    reason,
  };
}

export async function refreshOsintForCharacter(character: Character, plan: string | null | undefined, userQuestion = "") {
  if (!character || character.type !== "real_person") return { refreshed: false, reason: "NOT_ELIGIBLE" as const };
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return { refreshed: false, reason: "NOT_CONFIGURED" as const };
  const normalizedPlan = plan === "premium" ? "premium" : "free";
  // OSINT is a paid product capability. Enforce this server-side in every environment,
  // including local/staging, so a free account can never accidentally consume Tavily credits.
  if (normalizedPlan !== "premium") return { refreshed: false, reason: "PREMIUM_REQUIRED" as const };
  const now = Date.now();
  const dailyLimit = envInt("TAVILY_DEV_DAILY_CREDITS", DEFAULT_DAILY_CREDITS, 1, 1000);

  const name = cleanText(character.name, 80).replace(/["\r\n]/g, " ").trim();
  if (!name) return { refreshed: false, reason: "INVALID_SUBJECT" as const };
  const safeQuestion = cleanText(userQuestion, 420)
    .replace(/["\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (safeQuestion && (BLOCKED_TEXT.test(safeQuestion) || INSTRUCTION_SHAPED_QUERY.test(safeQuestion))) {
    recordAttempt(character.id, now, "Pergunta fora do escopo de pesquisa pública.", true);
    return { refreshed: false, reason: "QUESTION_OUT_OF_SCOPE" as const };
  }
  const osintPlan = classifyOsintRequest(safeQuestion);
  if (!osintPlan.shouldSearch) return { refreshed: false, reason: "NOT_FACTUAL" as const };
  const claimed = isPostgresControlEnabled()
    ? await claimPostgresOsintRefresh(character.id, now, dailyLimit, osintPlan.credits, SUBJECT_COOLDOWN_MS)
    : claimRefresh(character.id, now, dailyLimit, osintPlan.credits);
  if (!claimed) return { refreshed: false, reason: "COOLDOWN_OR_DAILY_LIMIT" as const };
  const intentSuffix = WORK_SIGNALS.test(safeQuestion) ? " recent works official credits" : CAREER_SIGNALS.test(safeQuestion) ? " career official biography" : osintPlan.topic === "news" ? " latest reliable public reporting" : " official biography career works";
  const query = `"${name}" ${safeQuestion || intentSuffix}`.trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(TAVILY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ api_key: apiKey, query, search_depth: osintPlan.deep ? "advanced" : "basic", max_results: MAX_RESULTS, chunks_per_source: osintPlan.deep ? 2 : 1, include_answer: false, include_raw_content: false, include_images: false, topic: osintPlan.topic, ...(osintPlan.days ? { days: osintPlan.days } : {}), ...(osintPlan.timeRange ? { time_range: osintPlan.timeRange } : {}) }),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = cleanText(data?.detail ?? data?.error ?? `Tavily respondeu HTTP ${response.status}`, 220);
        if (isPostgresControlEnabled()) await upsertPostgresOsintRefreshLog(character.id, now, null, 0, detail);
      else recordAttempt(character.id, now, detail, false);
      return { refreshed: false, reason: "PROVIDER_ERROR" as const, creditsUsed: 0 };
    }
    const results = Array.isArray(data?.results) ? data.results as TavilySearchResult[] : [];
    const facts = parseTavilyResults(results, character.id, now).filter(isFactAllowedByPolicy);
    if (facts.length) {
      await storeFacts(character.id, facts, now);
      // Keep only approved normalized data. URLs/content are not persisted.
      if (isPostgresControlEnabled()) await upsertPostgresOsintRefreshLog(character.id, now, now, osintPlan.credits, null);
      else recordAttempt(character.id, now, null, true);
      return { refreshed: true, reason: "SUCCESS" as const, factCount: facts.length, creditsUsed: osintPlan.credits, deep: osintPlan.deep, researchReason: osintPlan.reason };
    }
    if (isPostgresControlEnabled()) await upsertPostgresOsintRefreshLog(character.id, now, now, 0, "Nenhum resultado público aprovado.");
    else recordAttempt(character.id, now, "Nenhum resultado público aprovado.", true);
    return { refreshed: false, reason: "NO_APPROVED_FACTS" as const, creditsUsed: 0 };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Falha ao consultar Tavily.";
    if (isPostgresControlEnabled()) await upsertPostgresOsintRefreshLog(character.id, now, null, 0, detail);
    else recordAttempt(character.id, now, detail, false);
    return { refreshed: false, reason: "NETWORK_ERROR" as const, creditsUsed: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureOsintForChat(
  character: Character,
  roleplayContext: string,
  plan: string | null | undefined,
  userQuestion = "",
  requestId = "",
  userId = "",
) {
  const startedAt = Date.now();
  if (character.type !== "real_person" || plan !== "premium") return { facts: [], refreshed: false, cacheHit: false, creditsUsed: 0, reason: "NOT_ELIGIBLE" as const };
  const researchPlan = classifyOsintRequest(userQuestion);
  if (!researchPlan.shouldSearch) {
    void recordProductionOsintEvent({ userId: userId || undefined, characterId: character.id, plan: "premium", questionFresh: false, refreshed: false, cacheHit: false, creditsUsed: 0, resultCount: 0, latencyMs: Date.now()-startedAt, requestId, reason: "NOT_FACTUAL" });
    return { facts: [], refreshed: false, cacheHit: false, creditsUsed: 0, reason: "NOT_FACTUAL" as const, researchPlan };
  }
  let facts = await getApprovedFactsAsync(character, roleplayContext, researchPlan);
  const asksForFreshPublicInfo = researchPlan.topic === "news" || researchPlan.reason.startsWith("FRESH_");
  if (facts.length && !asksForFreshPublicInfo) {
    void recordProductionOsintEvent({ userId: userId || undefined, characterId: character.id, plan: "premium", questionFresh: false, refreshed: false, cacheHit: true, creditsUsed: 0, resultCount: facts.length, latencyMs: Date.now()-startedAt, requestId, reason: "CACHE_SUFFICIENT" });
    return { facts, refreshed: false, cacheHit: true, creditsUsed: 0, reason: "CACHE_SUFFICIENT" as const, researchPlan };
  }
  const result = await refreshOsintForCharacter(character, plan, userQuestion);
  facts = await getApprovedFactsAsync(character, roleplayContext, researchPlan);
  const refreshed = result.reason === "SUCCESS";
  const creditsUsed = Number(result.creditsUsed ?? (refreshed ? researchPlan.credits : 0));
  void recordProductionOsintEvent({ userId: userId || undefined, characterId: character.id, plan: "premium", questionFresh: asksForFreshPublicInfo, refreshed, cacheHit: false, creditsUsed, resultCount: facts.length, latencyMs: Date.now()-startedAt, requestId, reason: result.reason });
  return { facts, refreshed, cacheHit: false, creditsUsed, reason: result.reason, researchPlan };
}

async function getApprovedFactsAsync(character: Character, roleplayContext: string, researchPlan: OsintResearchPlan) {
  if (isPostgresControlEnabled()) {
    const rows = await loadPostgresOsintFacts(character.id);
    const mapped = rows.map((row) => ({
      id: String(row.id), subjectId: String(row.subject_id), category: String(row.category) as OsintFact["category"],
      factText: String(row.fact_text), confidence: String(row.confidence) as OsintFact["confidence"], sourceCount: Number(row.source_count ?? 0),
      sourceLastVerifiedAt: row.source_last_verified_at == null ? null : Number(row.source_last_verified_at),
      expiresAt: row.expires_at == null ? null : Number(row.expires_at), status: String(row.status) as OsintFact["status"],
      sourceDomains: Array.isArray(row.source_domains) ? row.source_domains.map(String).slice(0, 5) : [],
    }));
    return selectOsintFactsForRoleplay(mapped.filter((fact) => factMatchesResearchPlan(fact, researchPlan)), roleplayContext, 8);
  }
  const facts = getApprovedFacts(character, roleplayContext, 12);
  return facts.filter((fact) => factMatchesResearchPlan(fact, researchPlan)).slice(0, 8);
}

function factMatchesResearchPlan(fact: OsintFact, plan: OsintResearchPlan) {
  if (plan.reason === "WORKS") return fact.category === "works" || fact.category === "career";
  if (plan.reason === "CAREER") return fact.category === "career" || fact.category === "public_biography";
  if (plan.reason === "BIOGRAPHY") return fact.category === "public_biography" || fact.category === "career" || fact.category === "works";
  return true;
}

function getApprovedFacts(character: Character, roleplayContext: string, limit: number) {
  const now = Date.now();
  const rows = getDb().prepare(`SELECT id,subject_id,category,fact_text,confidence,source_count,source_last_verified_at,expires_at,status\n    FROM osint_facts WHERE subject_id=? AND subject_type='real_public_figure' AND status='active'\n      AND (expires_at IS NULL OR expires_at > ?) ORDER BY updated_at DESC LIMIT 40`).all(character.id, now) as Array<Record<string, unknown>>;
  return selectOsintFactsForRoleplay(rows.map((row) => ({
    id: String(row.id), subjectId: String(row.subject_id), category: String(row.category) as OsintFact["category"], factText: String(row.fact_text), confidence: String(row.confidence) as OsintFact["confidence"], sourceCount: Number(row.source_count ?? 0), sourceLastVerifiedAt: row.source_last_verified_at == null ? null : Number(row.source_last_verified_at), expiresAt: row.expires_at == null ? null : Number(row.expires_at), status: String(row.status) as OsintFact["status"],
  })), roleplayContext, limit);
}
