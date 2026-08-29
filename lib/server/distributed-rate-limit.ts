import { createHash } from "node:crypto";

const memory = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;

function getKey(req: Request, key: string) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "unknown";
  return `pc:rl:${key}:${createHash("sha1").update(ip).digest("hex")}`;
}

async function upstash(command: unknown[]) {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`UPSTASH_HTTP_${response.status}`);
  const data = await response.json() as { result?: unknown };
  return data.result;
}

/**
 * Distributed fixed-window limiter. Upstash is optional for local development;
 * production can require it with PERSONACHAT_REQUIRE_DISTRIBUTED_RATE_LIMIT=1.
 */
export async function distributedRateLimit(req: Request, key: string, limit: number, windowMs = WINDOW_MS) {
  const bucket = getKey(req, key);
  const configured = Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
  if (configured) {
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    const count = Number(await upstash(["INCR", bucket]) ?? 0);
    if (count === 1) await upstash(["EXPIRE", bucket, windowSeconds]);
    const retryAfter = Math.max(1, windowSeconds);
    return { allowed: count <= limit, retryAfter };
  }
  if (process.env.PERSONACHAT_REQUIRE_DISTRIBUTED_RATE_LIMIT === "1" && process.env.NODE_ENV === "production") {
    return { allowed: false, retryAfter: 60 };
  }
  const now = Date.now();
  const existing = memory.get(bucket);
  if (!existing || existing.resetAt <= now) {
    memory.set(bucket, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: Math.ceil(windowMs / 1000) };
  }
  existing.count += 1;
  return { allowed: existing.count <= limit, retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
}
