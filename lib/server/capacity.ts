import { getDb } from "./db";
import { getPostgres, isPostgresConfigured } from "./postgres";

const DEFAULT_CAPACITY = 5;
const DEFAULT_LEASE_SECONDS = 90;
const DEFAULT_BATCH_MINUTES = 2;
const DEFAULT_WAITING_TIMEOUT_MINUTES = 30;

export type CapacityState = {
  access: "granted" | "waiting";
  premiumBypass: boolean;
  capacity: number;
  activeCount: number;
  waitingCount: number;
  queuePosition: number;
  estimatedWaitSeconds: number;
  leaseExpiresAt: number | null;
};

export type CapacitySettings = {
  capacity: number;
  source: "postgres" | "environment";
  updatedAt: number | null;
  updatedBy: string | null;
};

function positiveInt(value: string | undefined, fallback: number, min = 1, max = 100_000) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) return fallback;
  return Math.min(parsed, max);
}

function envCapacity() {
  return positiveInt(process.env.PERSONACHAT_FREE_CONCURRENT_USERS, DEFAULT_CAPACITY, 1, 10_000);
}

function leaseMs() {
  return positiveInt(process.env.PERSONACHAT_QUEUE_LEASE_SECONDS, DEFAULT_LEASE_SECONDS, 30, 3600) * 1000;
}

function waitingTimeoutMs() {
  return positiveInt(process.env.PERSONACHAT_QUEUE_WAITING_TIMEOUT_MINUTES, DEFAULT_WAITING_TIMEOUT_MINUTES, 5, 24 * 60) * 60_000;
}

function batchMinutes() {
  return positiveInt(process.env.PERSONACHAT_QUEUE_BATCH_MINUTES, DEFAULT_BATCH_MINUTES, 1, 60);
}

function usePostgres() {
  return process.env.PERSONACHAT_POSTGRES_CONTROL === "1" && isPostgresConfigured();
}

function sqliteCapacity() {
  return envCapacity();
}

async function postgresCapacity() {
  const sql = getPostgres();
  const rows = await sql`SELECT capacity,updated_at,updated_by FROM beta_capacity_settings WHERE id=1 LIMIT 1`;
  const row = rows[0] as any;
  if (!row) {
    const now = Date.now();
    await sql`INSERT INTO beta_capacity_settings(id,capacity,updated_at,updated_by) VALUES(1,${envCapacity()},${now},NULL) ON CONFLICT(id) DO NOTHING`;
    return { capacity: envCapacity(), updatedAt: now, updatedBy: null };
  }
  return { capacity: positiveInt(String(row.capacity), envCapacity(), 1, 10_000), updatedAt: Number(row.updated_at ?? 0) || null, updatedBy: row.updated_by ? String(row.updated_by) : null };
}

export async function getCapacitySettings(): Promise<CapacitySettings> {
  if (!usePostgres()) return { capacity: sqliteCapacity(), source: "environment", updatedAt: null, updatedBy: null };
  const row = await postgresCapacity();
  return { ...row, source: "postgres" };
}

export async function setCapacityLimit(capacity: number, adminUserId: string): Promise<CapacitySettings> {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10_000) throw new Error("INVALID_CAPACITY");
  if (!usePostgres()) throw new Error("POSTGRES_CONTROL_REQUIRED");
  const sql = getPostgres();
  const now = Date.now();
  await sql`INSERT INTO beta_capacity_settings(id,capacity,updated_at,updated_by)
    VALUES(1,${capacity},${now},${adminUserId})
    ON CONFLICT(id) DO UPDATE SET capacity=EXCLUDED.capacity,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by`;
  await promotePostgresQueue();
  return { capacity, source: "postgres", updatedAt: now, updatedBy: adminUserId };
}

async function cleanupAndPromotePostgres(capacity: number) {
  const sql = getPostgres();
  const now = Date.now();
  await sql`DELETE FROM capacity_leases WHERE status='active' AND last_seen_at < ${now - leaseMs()}`;
  await sql`DELETE FROM capacity_leases WHERE status='waiting' AND last_seen_at < ${now - waitingTimeoutMs()}`;
  await sql`DELETE FROM capacity_leases WHERE user_id IN (SELECT id FROM users WHERE blocked_at IS NOT NULL)`;
  const activeRows = await sql`SELECT COUNT(*)::int AS count FROM capacity_leases WHERE status='active'`;
  const active = Number(activeRows[0]?.count ?? 0);
  const slots = Math.max(0, capacity - active);
  if (slots > 0) {
    const waiting = await sql.begin(async (tx) => {
      const rows = await tx`SELECT user_id FROM capacity_leases WHERE status='waiting' ORDER BY joined_at ASC FOR UPDATE SKIP LOCKED LIMIT ${slots}`;
      for (const row of rows) {
        await tx`UPDATE capacity_leases SET status='active',granted_at=${now},last_seen_at=${now} WHERE user_id=${row.user_id} AND status='waiting'`;
      }
      return rows;
    });
    return waiting.length;
  }
  return 0;
}

async function promotePostgresQueue() {
  const settings = await postgresCapacity();
  return cleanupAndPromotePostgres(settings.capacity);
}

async function getPostgresState(userId: string, plan: "free" | "premium", isAdmin = false): Promise<CapacityState> {
  const settings = await postgresCapacity();
  const capacity = settings.capacity;
  const sql = getPostgres();

  if (isAdmin || plan === "premium") {
    await sql`DELETE FROM capacity_leases WHERE user_id=${userId}`;
    const activeRows = await sql`SELECT COUNT(*)::int AS count FROM capacity_leases WHERE status='active'`;
    return { access:"granted", premiumBypass:true, capacity, activeCount:Number(activeRows[0]?.count ?? 0), waitingCount:0, queuePosition:0, estimatedWaitSeconds:0, leaseExpiresAt:null };
  }

  await cleanupAndPromotePostgres(capacity);
  const now = Date.now();
  const existing = await sql`SELECT status,joined_at,granted_at FROM capacity_leases WHERE user_id=${userId} LIMIT 1`;
  if (!existing.length) {
    await sql`INSERT INTO capacity_leases(user_id,status,joined_at,granted_at,last_seen_at) VALUES(${userId},'waiting',${now},NULL,${now})`;
  } else {
    await sql`UPDATE capacity_leases SET last_seen_at=${now} WHERE user_id=${userId}`;
  }
  await cleanupAndPromotePostgres(capacity);
  return readPostgresState(userId, capacity);
}

async function readPostgresState(userId: string, capacity: number): Promise<CapacityState> {
  const sql = getPostgres();
  const [rowRows, activeRows, waitingRows] = await Promise.all([
    sql`SELECT status,granted_at,joined_at FROM capacity_leases WHERE user_id=${userId} LIMIT 1`,
    sql`SELECT COUNT(*)::int AS count FROM capacity_leases WHERE status='active'`,
    sql`SELECT COUNT(*)::int AS count FROM capacity_leases WHERE status='waiting'`,
  ]);
  const row = rowRows[0] as any;
  const activeCount = Number(activeRows[0]?.count ?? 0);
  const waitingCount = Number(waitingRows[0]?.count ?? 0);
  if (!row) {
    return { access:"waiting", premiumBypass:false, capacity, activeCount, waitingCount, queuePosition:waitingCount, estimatedWaitSeconds:Math.max(60,batchMinutes()*60), leaseExpiresAt:null };
  }
  if (row.status === "active") {
    return { access:"granted", premiumBypass:false, capacity, activeCount, waitingCount, queuePosition:0, estimatedWaitSeconds:0, leaseExpiresAt:row.granted_at ? Number(row.granted_at)+leaseMs() : null };
  }
  const positionRows = await sql`SELECT COUNT(*)::int AS count FROM capacity_leases WHERE status='waiting' AND joined_at <= ${Number(row.joined_at)}`;
  const position = Math.max(1, Number(positionRows[0]?.count ?? 1));
  const batchesAhead = Math.max(1, Math.ceil(position / capacity));
  return { access:"waiting", premiumBypass:false, capacity, activeCount, waitingCount, queuePosition:position, estimatedWaitSeconds:batchesAhead*batchMinutes()*60, leaseExpiresAt:null };
}

function cleanupAndPromoteSqlite() {
  const db = getDb();
  const now = Date.now();
  db.prepare("DELETE FROM capacity_leases WHERE status='active' AND last_seen_at < ?").run(now - leaseMs());
  db.prepare("DELETE FROM capacity_leases WHERE status='waiting' AND last_seen_at < ?").run(now - waitingTimeoutMs());
  db.prepare("DELETE FROM capacity_leases WHERE user_id IN (SELECT id FROM users WHERE blocked_at IS NOT NULL)").run();
  const active = Number((db.prepare("SELECT COUNT(*) AS count FROM capacity_leases WHERE status='active'").get() as any)?.count ?? 0);
  const slots = Math.max(0, sqliteCapacity() - active);
  if (slots > 0) {
    const waiting = db.prepare("SELECT user_id FROM capacity_leases WHERE status='waiting' ORDER BY joined_at ASC LIMIT ?").all(slots) as any[];
    for (const row of waiting) db.prepare("UPDATE capacity_leases SET status='active',granted_at=?,last_seen_at=? WHERE user_id=? AND status='waiting'").run(now,now,row.user_id);
  }
}

function withQueueLock<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try { const result=fn(); db.exec("COMMIT"); return result; }
  catch(error){ try{db.exec("ROLLBACK")}catch{} throw error; }
}

function readSqliteState(userId:string): CapacityState {
  const db=getDb();
  const row=db.prepare("SELECT status,granted_at,joined_at FROM capacity_leases WHERE user_id=?").get(userId) as any;
  const activeCount=Number((db.prepare("SELECT COUNT(*) AS count FROM capacity_leases WHERE status='active'").get() as any)?.count ?? 0);
  const waitingCount=Number((db.prepare("SELECT COUNT(*) AS count FROM capacity_leases WHERE status='waiting'").get() as any)?.count ?? 0);
  if(!row) return {access:"waiting",premiumBypass:false,capacity:sqliteCapacity(),activeCount,waitingCount,queuePosition:waitingCount,estimatedWaitSeconds:Math.max(60,batchMinutes()*60),leaseExpiresAt:null};
  if(row.status==="active") return {access:"granted",premiumBypass:false,capacity:sqliteCapacity(),activeCount,waitingCount,queuePosition:0,estimatedWaitSeconds:0,leaseExpiresAt:row.granted_at?Number(row.granted_at)+leaseMs():null};
  const pos=Number((db.prepare("SELECT COUNT(*) AS count FROM capacity_leases WHERE status='waiting' AND joined_at <= ?").get(Number(row.joined_at)) as any)?.count ?? 1);
  const batches=Math.max(1,Math.ceil(pos/sqliteCapacity()));
  return {access:"waiting",premiumBypass:false,capacity:sqliteCapacity(),activeCount,waitingCount,queuePosition:Math.max(1,pos),estimatedWaitSeconds:batches*batchMinutes()*60,leaseExpiresAt:null};
}

export async function getCapacityState(userId:string,plan:"free"|"premium",isAdmin=false):Promise<CapacityState>{
  if(usePostgres()) return getPostgresState(userId,plan,isAdmin);
  return withQueueLock(()=>{
    cleanupAndPromoteSqlite();
    const now=Date.now();
    const db=getDb();
    const existing=db.prepare("SELECT status FROM capacity_leases WHERE user_id=?").get(userId) as any;
    if(!existing) db.prepare("INSERT INTO capacity_leases(user_id,status,joined_at,granted_at,last_seen_at) VALUES(?,'waiting',?,NULL,?)").run(userId,now,now);
    else db.prepare("UPDATE capacity_leases SET last_seen_at=? WHERE user_id=?").run(now,userId);
    cleanupAndPromoteSqlite();
    return readSqliteState(userId);
  });
}

export async function heartbeatCapacity(userId:string,plan:"free"|"premium",isAdmin=false){
  if(usePostgres()) {
    const settings=await postgresCapacity();
    if(isAdmin||plan==="premium") return getPostgresState(userId,plan,isAdmin);
    await cleanupAndPromotePostgres(settings.capacity);
    const now=Date.now();
    const sql=getPostgres();
    const existing=await sql`SELECT status FROM capacity_leases WHERE user_id=${userId} LIMIT 1`;
    if(!existing.length) await sql`INSERT INTO capacity_leases(user_id,status,joined_at,granted_at,last_seen_at) VALUES(${userId},'waiting',${now},NULL,${now})`;
    else await sql`UPDATE capacity_leases SET last_seen_at=${now} WHERE user_id=${userId}`;
    await cleanupAndPromotePostgres(settings.capacity);
    return readPostgresState(userId,settings.capacity);
  }
  return getCapacityState(userId,plan,isAdmin);
}

export async function leaveCapacity(userId:string){
  if(usePostgres()) { const sql=getPostgres(); await sql`DELETE FROM capacity_leases WHERE user_id=${userId}`; await promotePostgresQueue(); return; }
  withQueueLock(()=>{getDb().prepare("DELETE FROM capacity_leases WHERE user_id=?").run(userId);cleanupAndPromoteSqlite();});
}

export async function requireCapacityAccess(userId:string,plan:"free"|"premium"){
  const state=await getCapacityState(userId,plan);
  if(state.access==="granted") return state;
  const error=Object.assign(new Error("CAPACITY_QUEUE"),{state});
  throw error;
}
