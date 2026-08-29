import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { distributedRateLimit } from "@/lib/server/distributed-rate-limit";

const RATE_WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  try {
    const derived = scryptSync(password, salt, 64);
    const expected = Buffer.from(key, "hex");
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

export function newSessionToken() { return randomBytes(32).toString("hex"); }
export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }

export function enforceBodySize(req: Request, maxBytes: number) {
  const raw = req.headers.get("content-length");
  if (raw && Number(raw) > maxBytes) throw new Error("BODY_TOO_LARGE");
}

export async function readJsonBody<T = unknown>(req: Request, maxBytes: number): Promise<T> {
  // Content-Length is only an early rejection. The actual byte count is checked
  // after reading the body too, so chunked requests cannot bypass the limit.
  enforceBodySize(req, maxBytes);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error("BODY_TOO_LARGE");
  if (!bytes.byteLength) throw new Error("INVALID_JSON");
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
  } catch {
    throw new Error("INVALID_JSON");
  }
}

export function requireSameOrigin(req: Request) {
  if (process.env.NODE_ENV !== "production") return;
  const origin = req.headers.get("origin");
  if (!origin) throw new Error("BAD_ORIGIN");
  const requestOrigin = new URL(req.url).origin;
  if (origin !== requestOrigin) throw new Error("BAD_ORIGIN");
}

export function rateLimit(req: Request, key: string, limit: number, windowMs = RATE_WINDOW_MS) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "unknown";
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const existing = buckets.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: Math.ceil(windowMs / 1000) };
  }
  existing.count += 1;
  if (existing.count > limit) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  return { allowed: true, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
}

export function securityFailure(error: unknown) {
  if (error instanceof Error && error.message === "BODY_TOO_LARGE") return "BODY_TOO_LARGE";
  if (error instanceof Error && error.message === "BAD_ORIGIN") return "BAD_ORIGIN";
  if (error instanceof Error && error.message === "INVALID_JSON") return "INVALID_JSON";
  return null;
}

export async function productionRateLimit(req: Request, key: string, limit: number, windowMs = RATE_WINDOW_MS) {
  return distributedRateLimit(req, key, limit, windowMs);
}
