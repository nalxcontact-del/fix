import { getDb } from "./db";

const DEFAULT_GLOBAL_CONCURRENCY = 8;
const DEFAULT_LEASE_MS = 45_000;

function positiveInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) return fallback;
  return Math.min(parsed, max);
}

function limit() {
  return positiveInt(process.env.PERSONACHAT_GEMINI_CONCURRENCY, DEFAULT_GLOBAL_CONCURRENCY, 1, 256);
}

function leaseMs() {
  return positiveInt(process.env.PERSONACHAT_GEMINI_LEASE_MS, DEFAULT_LEASE_MS, 10_000, 5 * 60_000);
}

export function ensureGenerationCapacitySchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS generation_leases (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_generation_leases_provider_expiry
      ON generation_leases(provider, expires_at);
  `);
}

export function acquireGenerationLease(userId: string, provider: string) {
  ensureGenerationCapacitySchema();
  const db = getDb();
  const now = Date.now();
  const id = crypto.randomUUID();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM generation_leases WHERE expires_at <= ?").run(now);
    const active = Number((db.prepare("SELECT COUNT(*) AS count FROM generation_leases WHERE provider=?").get(provider) as { count?: number })?.count ?? 0);
    if (active >= limit()) {
      db.exec("ROLLBACK");
      return null;
    }
    db.prepare("INSERT INTO generation_leases(id,user_id,provider,created_at,expires_at) VALUES(?,?,?,?,?)")
      .run(id, userId, provider, now, now + leaseMs());
    db.exec("COMMIT");
    return { id, expiresAt: now + leaseMs() };
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

export function releaseGenerationLease(id: string | null | undefined) {
  if (!id) return;
  try { getDb().prepare("DELETE FROM generation_leases WHERE id=?").run(id); } catch {}
}

export function generationCapacityState(provider: string) {
  ensureGenerationCapacitySchema();
  const db = getDb();
  const now = Date.now();
  db.prepare("DELETE FROM generation_leases WHERE expires_at <= ?").run(now);
  const active = Number((db.prepare("SELECT COUNT(*) AS count FROM generation_leases WHERE provider=?").get(provider) as { count?: number })?.count ?? 0);
  return { active, limit: limit(), available: Math.max(0, limit() - active) };
}
