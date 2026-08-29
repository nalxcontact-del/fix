import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { getPostgres, isPostgresConfigured } from "./postgres";

export type BillingCycle = "monthly" | "yearly";
export type SubscriptionStatus = "pending" | "authorized" | "active" | "paused" | "cancelled" | "canceled" | "expired" | "rejected";

export const PREMIUM_PRICES_USD = Object.freeze({
  monthly: Number.isFinite(Number(process.env.PERSONACHAT_PREMIUM_MONTHLY_USD)) ? Number(process.env.PERSONACHAT_PREMIUM_MONTHLY_USD) : 14.99,
  yearly: Number.isFinite(Number(process.env.PERSONACHAT_PREMIUM_YEARLY_USD)) ? Number(process.env.PERSONACHAT_PREMIUM_YEARLY_USD) : 119.99,
});
export const PREMIUM_ANNUAL_SAVINGS_PERCENT = Math.max(0, Math.round((1 - (PREMIUM_PRICES_USD.yearly / 12) / PREMIUM_PRICES_USD.monthly) * 100));

function canUsePostgres() {
  return process.env.PERSONACHAT_POSTGRES_CONTROL === "1" && isPostgresConfigured();
}

export function ensureBillingTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_subscription_id TEXT UNIQUE,
      provider_customer_id TEXT,
      billing TEXT NOT NULL,
      status TEXT NOT NULL,
      currency TEXT,
      amount REAL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      current_period_end INTEGER,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user_status ON billing_subscriptions(user_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_provider_id ON billing_subscriptions(provider, provider_subscription_id);
    CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_customer ON billing_subscriptions(provider, provider_customer_id);
  `);
  try { db.exec(`ALTER TABLE billing_subscriptions ADD COLUMN provider_customer_id TEXT`); } catch (error) { if (!/duplicate column name/i.test(String(error))) throw error; }
}

export async function getSubscriptionForUser(userId: string) {
  if (canUsePostgres()) {
    const sql = getPostgres();
    const rows = await sql`
      SELECT id,user_id,provider,provider_subscription_id,provider_customer_id,billing,status,currency,amount,created_at,updated_at,current_period_end,cancel_at_period_end,raw_json
      FROM billing_subscriptions
      WHERE user_id=${userId}
      ORDER BY updated_at DESC LIMIT 1
    `;
    return rows[0] ?? null;
  }
  ensureBillingTables();
  return getDb().prepare(`SELECT id,user_id,provider,provider_subscription_id,provider_customer_id,billing,status,currency,amount,created_at,updated_at,current_period_end,cancel_at_period_end,raw_json FROM billing_subscriptions WHERE user_id=? ORDER BY updated_at DESC LIMIT 1`).get(userId) as any ?? null;
}

export async function createPendingSubscription(input: { userId:string; providerSubscriptionId?:string|null; billing:BillingCycle; provider:string; currency?:string|null; amount?:number|null; raw?:unknown }) {
  const now = Date.now();
  const id = randomUUID();
  if (canUsePostgres()) {
    const sql = getPostgres();
    await sql`INSERT INTO billing_subscriptions (id,user_id,provider,provider_subscription_id,billing,status,currency,amount,created_at,updated_at,cancel_at_period_end,raw_json)
      VALUES (${id},${input.userId},${input.provider},${input.providerSubscriptionId ?? null},${input.billing},'pending',${input.currency ?? null},${input.amount ?? null},${now},${now},0,${JSON.stringify(input.raw ?? {})})
      ON CONFLICT (provider_subscription_id) DO UPDATE SET user_id=EXCLUDED.user_id,billing=EXCLUDED.billing,status='pending',currency=EXCLUDED.currency,amount=EXCLUDED.amount,updated_at=EXCLUDED.updated_at,raw_json=EXCLUDED.raw_json`;
    return id;
  }
  ensureBillingTables();
  getDb().prepare(`INSERT INTO billing_subscriptions (id,user_id,provider,provider_subscription_id,billing,status,currency,amount,created_at,updated_at,cancel_at_period_end,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,0,?) ON CONFLICT(provider_subscription_id) DO UPDATE SET user_id=excluded.user_id,billing=excluded.billing,status='pending',currency=excluded.currency,amount=excluded.amount,updated_at=excluded.updated_at,raw_json=excluded.raw_json`).run(id,input.userId,input.provider,input.providerSubscriptionId ?? null,input.billing,"pending",input.currency ?? null,input.amount ?? null,now,now,JSON.stringify(input.raw ?? {}));
  return id;
}

export async function updateSubscriptionFromProvider(input: { provider: string; providerSubscriptionId:string; providerCustomerId?:string|null; userId?:string|null; billing?:BillingCycle; status:SubscriptionStatus; currency?:string|null; amount?:number|null; currentPeriodEnd?:number|null; cancelAtPeriodEnd?:boolean; raw?:unknown }) {
  const now = Date.now();
  const provider = String(input.provider || "").trim().toLowerCase();
  if (!provider) return null;
  if (canUsePostgres()) {
    const sql = getPostgres();
    const existing = await sql`SELECT id,user_id,billing,created_at FROM billing_subscriptions WHERE provider=${provider} AND provider_subscription_id=${input.providerSubscriptionId} LIMIT 1`;
    const row = existing[0] as any;
    const userId = input.userId ?? (row?.user_id ? String(row.user_id) : null);
    if (!userId) return null;
    const billing = input.billing ?? (row?.billing === "yearly" ? "yearly" : "monthly");
    await sql`INSERT INTO billing_subscriptions (id,user_id,provider,provider_subscription_id,provider_customer_id,billing,status,currency,amount,created_at,updated_at,current_period_end,cancel_at_period_end,raw_json)
      VALUES (${row?.id ?? randomUUID()},${userId},${provider},${input.providerSubscriptionId},${input.providerCustomerId ?? null},${billing},${input.status},${input.currency ?? null},${input.amount ?? null},${row ? Number(row.created_at) : now},${now},${input.currentPeriodEnd ?? null},${input.cancelAtPeriodEnd ? 1 : 0},${JSON.stringify(input.raw ?? {})})
      ON CONFLICT (provider_subscription_id) DO UPDATE SET provider_customer_id=EXCLUDED.provider_customer_id,status=EXCLUDED.status,billing=EXCLUDED.billing,currency=EXCLUDED.currency,amount=EXCLUDED.amount,updated_at=EXCLUDED.updated_at,current_period_end=EXCLUDED.current_period_end,cancel_at_period_end=EXCLUDED.cancel_at_period_end,raw_json=EXCLUDED.raw_json`;
    const active = input.status === "active" || input.status === "authorized";
    if (active) await sql`UPDATE users SET plan='premium' WHERE id=${userId}`;
    else if (["paused","cancelled","canceled","expired","rejected"].includes(input.status)) await sql`UPDATE users SET plan='free' WHERE id=${userId} AND NOT EXISTS (SELECT 1 FROM billing_subscriptions WHERE user_id=${userId} AND status IN ('active','authorized') AND provider_subscription_id<>${input.providerSubscriptionId})`;
    return userId;
  }
  ensureBillingTables();
  const db = getDb();
  const existing = db.prepare("SELECT id,user_id,billing,created_at FROM billing_subscriptions WHERE provider=? AND provider_subscription_id=? LIMIT 1").get(provider, input.providerSubscriptionId) as any;
  const userId = input.userId ?? existing?.user_id ?? null;
  if (!userId) return null;
  const billing = input.billing ?? (existing?.billing === "yearly" ? "yearly" : "monthly");
  db.prepare(`INSERT INTO billing_subscriptions (id,user_id,provider,provider_subscription_id,provider_customer_id,billing,status,currency,amount,created_at,updated_at,current_period_end,cancel_at_period_end,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider_subscription_id) DO UPDATE SET provider_customer_id=excluded.provider_customer_id,status=excluded.status,billing=excluded.billing,currency=excluded.currency,amount=excluded.amount,updated_at=excluded.updated_at,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,raw_json=excluded.raw_json`).run(existing?.id ?? randomUUID(),userId,provider,input.providerSubscriptionId,input.providerCustomerId ?? null,billing,input.status,input.currency ?? null,input.amount ?? null,existing ? Number(existing.created_at) : now,now,input.currentPeriodEnd ?? null,input.cancelAtPeriodEnd ? 1 : 0,JSON.stringify(input.raw ?? {}));
  if (input.status === "active" || input.status === "authorized") db.prepare("UPDATE users SET plan='premium' WHERE id=?").run(userId);
  else if (["paused","cancelled","canceled","expired","rejected"].includes(input.status)) db.prepare("UPDATE users SET plan='free' WHERE id=? AND NOT EXISTS (SELECT 1 FROM billing_subscriptions WHERE user_id=? AND status IN ('active','authorized') AND provider_subscription_id<>?)").run(userId,userId,input.providerSubscriptionId);
  return userId;
}
export async function cancelLocalSubscription(userId:string) {
  const sub = await getSubscriptionForUser(userId);
  if (!sub?.provider_subscription_id) throw new Error("ACTIVE_SUBSCRIPTION_NOT_FOUND");
  return String(sub.provider_subscription_id);
}

