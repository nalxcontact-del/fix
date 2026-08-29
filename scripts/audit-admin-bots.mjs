import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import postgres from "postgres";

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = value.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

loadLocalEnv();

const dir = process.env.PERSONACHAT_DATA_DIR || path.join(os.homedir(), ".personachat");
const dbPath = path.join(path.resolve(dir), "personachat.db");
if (!existsSync(dbPath)) throw new Error(`SQLite database not found: ${dbPath}`);

const adminEmail = String(process.env.PERSONACHAT_ADMIN_EMAILS || "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean)[0];
const adminUserId = String(process.env.PERSONACHAT_ADMIN_USER_IDS || "").split(",").map(v => v.trim()).filter(Boolean)[0];
const sqlite = new DatabaseSync(dbPath);

const databaseUrl = String(process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL || "").trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required for the Postgres comparison.");
const pg = postgres(databaseUrl, { prepare: false, max: 1, connect_timeout: 10 });

let admin = adminUserId
  ? sqlite.prepare("SELECT id,username,email FROM users WHERE id=? LIMIT 1").get(adminUserId)
  : adminEmail
    ? sqlite.prepare("SELECT id,username,email FROM users WHERE lower(email)=? LIMIT 1").get(adminEmail)
    : undefined;

if (!admin?.id) {
  admin = adminUserId
    ? await pg`SELECT id,username,email FROM public.users WHERE id=${adminUserId} LIMIT 1`.then(r => r[0])
    : adminEmail
      ? await pg`SELECT id,username,email FROM public.users WHERE lower(email)=${adminEmail} LIMIT 1`.then(r => r[0])
      : undefined;
}
if (!admin?.id) throw new Error("Admin account not found. Set PERSONACHAT_ADMIN_EMAILS or PERSONACHAT_ADMIN_USER_IDS in .env.local.");

const rows = sqlite.prepare(`
  SELECT id,name,owner_id,bot_type,visibility,created_at
  FROM user_bots WHERE owner_id=? ORDER BY created_at ASC, name ASC
`).all(String(admin.id));
try {
  const pgRows = await pg`SELECT id,owner_id,name,visibility FROM user_bots WHERE owner_id=${String(admin.id)} ORDER BY created_at ASC, name ASC`;
  const pgIds = new Set(pgRows.map(row => String(row.id)));
  const missingFromPostgres = rows.filter(row => !pgIds.has(String(row.id))).map(row => ({ id: String(row.id), name: String(row.name) }));
  const ownedElsewhere = rows.filter(row => pgRows.some(pgRow => String(pgRow.id) === String(row.id) && String(pgRow.owner_id) !== String(admin.id))).map(row => ({ id: String(row.id), name: String(row.name) }));
  console.log(JSON.stringify({
    admin: { id: String(admin.id), username: String(admin.username || ""), email: String(admin.email || "") },
    sqliteOwnedBotCount: rows.length,
    postgresOwnedBotCount: pgRows.length,
    missingFromPostgres,
    ownedElsewhere,
    sqliteBots: rows.map(row => ({ id: String(row.id), name: String(row.name), type: String(row.bot_type || "original"), visibility: String(row.visibility || "public") }))
  }, null, 2));
  if (missingFromPostgres.length || ownedElsewhere.length) process.exitCode = 2;
} finally {
  await pg.end({ timeout: 5 }).catch(() => {});
  sqlite.close();
}
