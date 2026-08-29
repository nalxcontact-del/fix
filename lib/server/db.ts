import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error Node 22+ built-in SQLite module.
import { DatabaseSync } from "node:sqlite";
import { BETA_EXISTING_CHARACTERS } from "./beta-existing-characters";
import { characters as BUILTIN_CHARACTERS } from "../../characters";
import { assertProductionFoundation } from "@/lib/server/production-config";

const stableDataDir = process.env.PERSONACHAT_DATA_DIR
  ? path.resolve(process.env.PERSONACHAT_DATA_DIR)
  : path.join(os.homedir(), ".personachat");

const projectDataDir = path.join(process.cwd(), "data");
const stableDbPath = path.join(stableDataDir, "personachat.db");
const projectDbPath = path.join(projectDataDir, "personachat.db");

mkdirSync(stableDataDir, { recursive: true });

if (!existsSync(stableDbPath) && existsSync(projectDbPath)) {
  try {
    const legacyDb = new DatabaseSync(projectDbPath);
    legacyDb.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    legacyDb.close();
    copyFileSync(projectDbPath, stableDbPath);
  } catch (error) {
    console.error("Could not migrate the local PersonaChat database:", error);
  }
}

const db = new DatabaseSync(stableDbPath);
if (process.env.PERSONACHAT_REQUIRE_POSTGRES === "1" && process.env.NODE_ENV === "production") {
  assertProductionFoundation();
}


// Multiple Next.js build workers can import this module at the same time.
// Set the busy timeout before changing journal mode so SQLite waits instead
// of failing immediately while another worker initializes the database.
db.exec(`
  PRAGMA busy_timeout = 10000;
  PRAGMA foreign_keys = ON;
  PRAGMA synchronous = NORMAL;
`);

for (let attempt = 0; attempt < 5; attempt += 1) {
  try {
    db.exec("PRAGMA journal_mode = WAL;");
    break;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/database is locked|database table is locked/i.test(message) || attempt === 4) throw error;
    const waitMs = 50 * (attempt + 1);
    const until = Date.now() + waitMs;
    while (Date.now() < until) { /* short synchronous retry backoff */ }
  }
}

function tableExists(name: string) {
  const row = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).get(name) as { name?: string } | undefined;
  return !!row?.name;
}

function columnExists(table: string, column: string) {
  if (!tableExists(table)) return false;
  const columns = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
  return columns.some((item) => item.name === column);
}

function ensureColumn(table: string, column: string, definition: string) {
  if (columnExists(table, column)) return;

  try {
    db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
  } catch (error) {
    // Next production builds can evaluate server modules in parallel worker
    // processes. Two workers may both observe a missing legacy column and
    // race to add it; one succeeds and the other receives SQLite's
    // "duplicate column name" error. A duplicate means the migration won the
    // race, so re-check the schema and only suppress that specific condition.
    const message = error instanceof Error ? error.message : String(error);
    if (/duplicate column name/i.test(message) && columnExists(table, column)) return;
    throw error;
  }
}

/*
 * Core account tables.
 */
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  username TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  avatar TEXT,
  gender TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  blocked_at INTEGER,
  blocked_reason TEXT NOT NULL DEFAULT '',
  google_sub TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_data (
  user_id TEXT PRIMARY KEY,
  conversations_json TEXT NOT NULL DEFAULT '[]',
  memories_json TEXT NOT NULL DEFAULT '[]',
  relationships_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

ensureColumn("users", "username", "TEXT");
ensureColumn("users", "avatar", "TEXT");
ensureColumn("users", "gender", "TEXT");
ensureColumn("users", "plan", "TEXT NOT NULL DEFAULT 'free'");
ensureColumn("users", "blocked_at", "INTEGER");
ensureColumn("users", "blocked_reason", "TEXT NOT NULL DEFAULT ''");
ensureColumn("users", "google_sub", "TEXT");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique ON users(google_sub) WHERE google_sub IS NOT NULL");
ensureColumn("app_data", "relationships_json", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("memories", "conversation_id", "TEXT");

/* Scope legacy memories to the conversation that produced their source message.
 * Memories without a source message are intentionally left unscoped until a new
 * conversation is used; the client/API will not reuse them across chats. */
try {
  db.prepare(`UPDATE memories SET conversation_id=(SELECT conversation_id FROM messages WHERE messages.id=memories.message_id) WHERE (conversation_id IS NULL OR conversation_id='') AND message_id IS NOT NULL`).run();
} catch {}

/*
 * Community/social tables.
 */
db.exec(`
CREATE TABLE IF NOT EXISTS bot_likes (
  user_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, bot_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS profile_likes (
  user_id TEXT NOT NULL,
  profile_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, profile_user_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(profile_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower_id, following_id),
  FOREIGN KEY(follower_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(following_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_bots (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  bot_type TEXT NOT NULL DEFAULT 'original',
  description TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  greeting TEXT NOT NULL DEFAULT '',
  personality TEXT NOT NULL DEFAULT '',
  scenario TEXT NOT NULL DEFAULT '',
  speech_style TEXT NOT NULL DEFAULT '',
  lore TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'public',
  real_person_safety INTEGER NOT NULL DEFAULT 0,
  example_messages_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS response_preference_profiles (
  user_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  positive_count INTEGER NOT NULL DEFAULT 0,
  negative_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, character_id, tag),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_response_preferences_user_character
  ON response_preference_profiles(user_id, character_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS response_feedback (
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, message_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS generation_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  model TEXT,
  provider TEXT NOT NULL DEFAULT 'gemini',
  plan TEXT NOT NULL DEFAULT 'free',
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS generation_reservations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_generation_reservations_user_expiry
  ON generation_reservations(user_id, expires_at);

CREATE TABLE IF NOT EXISTS quality_events (
  id TEXT PRIMARY KEY,
  issue_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quality_events_created
  ON quality_events(created_at DESC);

CREATE TABLE IF NOT EXISTS product_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_feedback_created
  ON product_feedback(created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  message_id TEXT,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'normal',
  resolution_note TEXT NOT NULL DEFAULT '',
  resolved_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  resolved_at INTEGER,
  FOREIGN KEY(reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(resolved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY(admin_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created
  ON admin_audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS capacity_leases (
  user_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('waiting', 'active')),
  joined_at INTEGER NOT NULL,
  granted_at INTEGER,
  last_seen_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_capacity_status_queue ON capacity_leases(status, joined_at);
`);

ensureColumn("response_feedback", "tags_json", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("response_feedback", "note", "TEXT NOT NULL DEFAULT ''");

ensureColumn("user_bots", "bot_type", "TEXT NOT NULL DEFAULT 'original'");
ensureColumn("user_bots", "description", "TEXT NOT NULL DEFAULT ''");
ensureColumn("user_bots", "image", "TEXT NOT NULL DEFAULT ''");
ensureColumn("user_bots", "greeting", "TEXT NOT NULL DEFAULT ''");
ensureColumn("user_bots", "personality", "TEXT NOT NULL DEFAULT ''");
ensureColumn("user_bots", "scenario", "TEXT NOT NULL DEFAULT ''");
ensureColumn("user_bots", "speech_style", "TEXT NOT NULL DEFAULT ''");
ensureColumn("user_bots", "lore", "TEXT NOT NULL DEFAULT ''");
ensureColumn("user_bots", "visibility", "TEXT NOT NULL DEFAULT 'public'");
ensureColumn("user_bots", "real_person_safety", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("user_bots", "example_messages_json", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("user_bots", "tags_json", "TEXT NOT NULL DEFAULT '[]'");


/*
 * Beta content ownership cleanup.
 *
 * For the initial PersonaChat beta, all pre-existing community bots are
 * editorial seed content owned by the dedicated PersonaChat admin account.
 * Two legacy test bots are intentionally removed.
 *
 * This migration runs once per database and never touches bots created after
 * the migration marker exists.
 */
db.exec(`
CREATE TABLE IF NOT EXISTS system_migrations (
  name TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
`);

const CONTENT_MIGRATION = "beta_seed_content_ownership_v1";
const migrationDone = db.prepare("SELECT name FROM system_migrations WHERE name=?").get(CONTENT_MIGRATION) as { name?: string } | undefined;
if (!migrationDone) {
  const adminEmail = String(process.env.PERSONACHAT_ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)[0] || "";

  if (adminEmail) {
    const admin = db.prepare("SELECT id FROM users WHERE lower(email)=?").get(adminEmail) as { id?: string } | undefined;
    if (admin?.id) {
      // Remove the two legacy/test characters from the database, including
      // their social/report references. Matching is case-insensitive.
      const legacyBots = db.prepare(`
        SELECT id FROM user_bots
        WHERE lower(trim(name)) IN ('joe biden', 'remy hadley')
      `).all() as Array<{ id: string }>;

      for (const bot of legacyBots) {
        db.prepare("DELETE FROM bot_likes WHERE bot_id=?").run(bot.id);
        db.prepare("DELETE FROM reports WHERE target_type='bot' AND target_id=?").run(bot.id);
        db.prepare("DELETE FROM user_bots WHERE id=?").run(bot.id);
      }

      // Claim every bot that existed before this migration for the admin
      // editorial profile. Future user-created bots are unaffected.
      db.prepare(`
        UPDATE user_bots
        SET owner_id=?
        WHERE lower(trim(name)) NOT IN ('joe biden', 'remy hadley')
      `).run(admin.id);

      db.prepare("INSERT OR IGNORE INTO system_migrations (name, applied_at) VALUES (?, ?)").run(CONTENT_MIGRATION, Date.now());
      console.log("[CONTENT MIGRATION] Seed bots assigned to admin profile:", admin.id);
    } else {
      console.warn("[CONTENT MIGRATION] Admin email configured but account was not found yet:", adminEmail);
    }
  }
}


const CONTENT_MIGRATION_V2 = "beta_seed_content_ownership_v2_admin_email";
const migrationV2Done = db.prepare("SELECT name FROM system_migrations WHERE name=?").get(CONTENT_MIGRATION_V2) as { name?: string } | undefined;
if (!migrationV2Done) {
  const configuredEmails = String(process.env.PERSONACHAT_ADMIN_EMAILS || "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const admin = configuredEmails.length
    ? db.prepare(`SELECT id FROM users WHERE lower(email) IN (${configuredEmails.map(() => "?").join(",")}) LIMIT 1`)
        .get(...configuredEmails) as { id?: string } | undefined
    : undefined;

  if (admin?.id) {
    const legacyBots = db.prepare(`
      SELECT id FROM user_bots
      WHERE lower(trim(name)) IN ('joe biden', 'remy hadley')
    `).all() as Array<{ id: string }>;

    for (const bot of legacyBots) {
      db.prepare("DELETE FROM bot_likes WHERE bot_id=?").run(bot.id);
      db.prepare("DELETE FROM reports WHERE target_type='bot' AND target_id=?").run(bot.id);
      db.prepare("DELETE FROM user_bots WHERE id=?").run(bot.id);
    }

    db.prepare(`
      UPDATE user_bots
      SET owner_id=?
      WHERE lower(trim(name)) NOT IN ('joe biden', 'remy hadley')
    `).run(admin.id);

    console.log("[CONTENT MIGRATION V2] Existing bots assigned to admin profile:", admin.id);
    db.prepare("INSERT OR IGNORE INTO system_migrations (name, applied_at) VALUES (?, ?)").run(CONTENT_MIGRATION_V2, Date.now());
  } else {
    console.warn("[CONTENT MIGRATION V2] Admin account not found yet.");
  }
}



const CONTENT_MIGRATION_V3 = "beta_seed_content_ownership_v3_backfill_profile";
const migrationV3Done = db.prepare("SELECT name FROM system_migrations WHERE name=?").get(CONTENT_MIGRATION_V3) as { name?: string } | undefined;
if (!migrationV3Done) {
  const configuredEmails = String(process.env.PERSONACHAT_ADMIN_EMAILS || "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const admin = configuredEmails.length
    ? db.prepare(`SELECT id FROM users WHERE lower(email) IN (${configuredEmails.map(() => "?").join(",")}) LIMIT 1`)
        .get(...configuredEmails) as { id?: string } | undefined
    : undefined;

  if (admin?.id) {
    // Recover legacy seed bots that were created before the original ownership
    // migration marker. Newer user-created bots are left untouched.
    const v2 = db.prepare("SELECT applied_at FROM system_migrations WHERE name=?").get(CONTENT_MIGRATION_V2) as { applied_at?: number } | undefined;
    const cutoff = Number(v2?.applied_at || Date.now());
    db.prepare(`
      UPDATE user_bots
      SET owner_id=?
      WHERE created_at <= ?
        AND lower(trim(name)) NOT IN ('joe biden', 'remy hadley')
    `).run(admin.id, cutoff);

    db.prepare("DELETE FROM bot_likes WHERE bot_id IN (SELECT id FROM user_bots WHERE lower(trim(name)) IN ('joe biden','remy hadley'))").run();
    db.prepare("DELETE FROM reports WHERE target_type='bot' AND target_id IN (SELECT id FROM user_bots WHERE lower(trim(name)) IN ('joe biden','remy hadley'))").run();
    db.prepare("DELETE FROM user_bots WHERE lower(trim(name)) IN ('joe biden','remy hadley')").run();
    db.prepare("INSERT OR IGNORE INTO system_migrations (name, applied_at) VALUES (?, ?)").run(CONTENT_MIGRATION_V3, Date.now());
    console.log("[CONTENT MIGRATION V3] Legacy seed bots backfilled to admin profile:", admin.id);
  } else {
    console.warn("[CONTENT MIGRATION V3] Admin account not found yet.");
  }
}


/*
 * Beta existing-character seed.
 *
 * These seven editorial characters are public seed content owned by the
 * PersonaChat admin account. INSERT OR IGNORE makes the migration safe to
 * restart and, importantly, does not overwrite later edits made from the
 * admin profile.
 */
const EXISTING_CHARACTERS_MIGRATION = "beta_existing_characters_v1";
const existingCharactersMigrationDone = db.prepare("SELECT name FROM system_migrations WHERE name=?").get(EXISTING_CHARACTERS_MIGRATION) as { name?: string } | undefined;
if (!existingCharactersMigrationDone) {
  const configuredEmails = String(process.env.PERSONACHAT_ADMIN_EMAILS || "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const admin = configuredEmails.length
    ? db.prepare(
        `SELECT id FROM users
         WHERE lower(email) IN (${configuredEmails.map(() => "?").join(",")})
         ORDER BY CASE WHEN lower(email)=? THEN 0 ELSE 1 END
         LIMIT 1`
      ).get(...configuredEmails) as { id?: string } | undefined
    : undefined;

  if (admin?.id) {
    const now = Date.now();
    const insertBot = db.prepare(`
      INSERT OR IGNORE INTO user_bots
        (id,owner_id,name,bot_type,description,image,greeting,personality,scenario,speech_style,lore,visibility,real_person_safety,example_messages_json,tags_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    for (const character of BETA_EXISTING_CHARACTERS) {
      insertBot.run(
        character.id,
        admin.id,
        character.name,
        character.type,
        character.description,
        character.image || "",
        character.greeting,
        character.personality,
        character.scenario,
        character.speechStyle || "",
        character.lore || "",
        "public",
        0,
        JSON.stringify(character.exampleMessages || []),
        JSON.stringify(character.tags || []),
        now,
      );
    }

    db.prepare("INSERT OR IGNORE INTO system_migrations (name, applied_at) VALUES (?, ?)").run(EXISTING_CHARACTERS_MIGRATION, now);
    console.log("[CONTENT MIGRATION] Seven existing-character beta bots seeded to admin profile.");
  } else {
    console.warn("[CONTENT MIGRATION] Existing-character seed waiting for the admin account.");
  }
}



/*
 * Editorial anime-character ownership migration.
 *
 * Naruto, Luffy and Revy started life as built-in characters. For the beta they
 * must behave like the other editorial bots: they live in user_bots, belong to
 * the admin account, appear on the admin profile, and can be edited there.
 * The migration is idempotent and never creates a second copy.
 */
const EDITORIAL_ANIME_MIGRATION = "beta_editorial_anime_admin_v1";
const editorialAnimeMigrationDone = db.prepare("SELECT name FROM system_migrations WHERE name=?").get(EDITORIAL_ANIME_MIGRATION) as { name?: string } | undefined;
if (!editorialAnimeMigrationDone) {
  const configuredEmails = String(process.env.PERSONACHAT_ADMIN_EMAILS || "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const admin = configuredEmails.length
    ? db.prepare(
        `SELECT id FROM users
         WHERE lower(email) IN (${configuredEmails.map(() => "?").join(",")})
         ORDER BY CASE WHEN lower(email)=? THEN 0 ELSE 1 END
         LIMIT 1`
      ).get(...configuredEmails) as { id?: string } | undefined
    : undefined;

  if (admin?.id) {
    const now = Date.now();
    const editorialIds = ["naruto", "luffy", "revy"];
    const insertBot = db.prepare(`
      INSERT OR IGNORE INTO user_bots
        (id,owner_id,name,bot_type,description,image,greeting,personality,scenario,speech_style,lore,visibility,real_person_safety,example_messages_json,tags_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    for (const id of editorialIds) {
      const character = BUILTIN_CHARACTERS.find((item) => item.id === id);
      if (!character) continue;
      insertBot.run(
        character.id,
        admin.id,
        character.name,
        "existing_character",
        character.description,
        character.image || "",
        character.greeting,
        character.personality,
        character.scenario,
        character.speechStyle || "",
        character.lore || "",
        "public",
        0,
        JSON.stringify(character.exampleMessages || []),
        JSON.stringify(character.tags || []),
        now,
      );
      // If an earlier beta build already inserted one of these editorial IDs,
      // make the ownership explicit rather than leaving the admin profile split.
      db.prepare("UPDATE user_bots SET owner_id=?, bot_type='existing_character', visibility='public' WHERE id=? AND bot_type='existing_character'").run(admin.id, id);
    }
    db.prepare("INSERT OR IGNORE INTO system_migrations (name, applied_at) VALUES (?, ?)").run(EDITORIAL_ANIME_MIGRATION, now);
    console.log("[CONTENT MIGRATION] Naruto, Luffy and Revy are admin-owned editorial bots.");
  } else {
    console.warn("[CONTENT MIGRATION] Editorial anime seed waiting for the admin account.");
  }
}


/*
 * Editorial existing-character reconciliation.
 *
 * Earlier beta builds could mark the seed migration as complete before one of
 * the seven rows (notably Jinx) existed in user_bots. That left the profile
 * editor looking correct while chat still used the immutable built-in copy.
 * This reconciliation is intentionally idempotent: it creates only missing
 * editorial rows and never overwrites an existing character's edited content.
 */
const EDITORIAL_RECONCILIATION_MIGRATION = "beta_existing_characters_admin_reconcile_v1";
const editorialReconciliationDone = db.prepare("SELECT name FROM system_migrations WHERE name=?").get(EDITORIAL_RECONCILIATION_MIGRATION) as { name?: string } | undefined;
if (!editorialReconciliationDone) {
  const configuredEmails = String(process.env.PERSONACHAT_ADMIN_EMAILS || "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const admin = configuredEmails.length ? db.prepare(
    `SELECT id FROM users
     WHERE lower(email) IN (${configuredEmails.map(() => "?").join(",")})
     LIMIT 1`
  ).get(...configuredEmails) as { id?: string } | undefined : undefined;

  if (admin?.id) {
    const now = Date.now();
    const insertBot = db.prepare(`
      INSERT OR IGNORE INTO user_bots
        (id,owner_id,name,bot_type,description,image,greeting,personality,scenario,speech_style,lore,visibility,real_person_safety,example_messages_json,tags_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const ensureOwned = db.prepare(
      "UPDATE user_bots SET owner_id=?, bot_type='existing_character', visibility='public' WHERE id=?"
    );

    for (const character of BETA_EXISTING_CHARACTERS) {
      insertBot.run(
        character.id,
        admin.id,
        character.name,
        character.type,
        character.description,
        character.image || "",
        character.greeting,
        character.personality,
        character.scenario,
        character.speechStyle || "",
        character.lore || "",
        "public",
        0,
        JSON.stringify(character.exampleMessages || []),
        JSON.stringify(character.tags || []),
        now,
      );
      ensureOwned.run(admin.id, character.id);
    }

    db.prepare("INSERT OR IGNORE INTO system_migrations (name, applied_at) VALUES (?, ?)" )
      .run(EDITORIAL_RECONCILIATION_MIGRATION, now);
    console.log("[CONTENT RECONCILIATION] Seven existing-character editorial bots are admin-owned and database-backed.");
  } else {
    console.warn("[CONTENT RECONCILIATION] Admin account not found yet; reconciliation will retry on next startup.");
  }
}

ensureColumn("generation_events", "provider", "TEXT NOT NULL DEFAULT 'gemini'");
// Existing events came from the older provider-aware transition. Infer their provider
// from the stored model so switching providers does not consume another provider's daily allowance.
db.exec(`UPDATE generation_events SET provider = CASE WHEN lower(COALESCE(model, '')) LIKE '%gemini%' THEN 'gemini' ELSE 'groq' END WHERE provider = 'gemini'`);
ensureColumn("generation_events", "plan", "TEXT NOT NULL DEFAULT 'free'");
ensureColumn("generation_events", "prompt_tokens", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("generation_events", "completion_tokens", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("generation_events", "total_tokens", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("generation_events", "estimated_cost_usd", "REAL NOT NULL DEFAULT 0");
ensureColumn("generation_events", "latency_ms", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("generation_events", "osint_refreshes", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("generation_events", "osint_cache_hit", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("generation_events", "request_id", "TEXT");



/*
 * OSINT knowledge cache.
 *
 * This stores only normalized, policy-approved facts and source metadata;
 * raw pages and sensitive personal data are intentionally not persisted.
 */
db.exec(`
CREATE TABLE IF NOT EXISTS osint_facts (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('real_public_figure')),
  category TEXT NOT NULL,
  fact_text TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK(confidence IN ('high','medium','low')),
  source_count INTEGER NOT NULL DEFAULT 0,
  source_last_verified_at INTEGER,
  expires_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','blocked','superseded')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_osint_facts_subject_status
  ON osint_facts(subject_id, status, expires_at);

CREATE TABLE IF NOT EXISTS osint_sources (
  id TEXT PRIMARY KEY,
  fact_id TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  reliability TEXT NOT NULL CHECK(reliability IN ('high','medium','low')),
  checked_at INTEGER NOT NULL,
  FOREIGN KEY(fact_id) REFERENCES osint_facts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_osint_sources_fact
  ON osint_sources(fact_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS osint_refresh_log (
  subject_id TEXT PRIMARY KEY,
  last_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_success_at INTEGER,
  credits_used INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_osint_refresh_log_attempt
  ON osint_refresh_log(last_attempt_at);
`);

/*
 * Normalized chat data.
 *
 * These tables are deliberately created before app-data queries run.
 * The old app_data JSON row remains as a compatibility/migration layer.
 */
db.exec(`
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Nova conversa',
  summary TEXT,
  summary_updated_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  edited INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'automatic',
  category TEXT,
  importance INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  supersedes_id TEXT,
  message_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS relationships (
  user_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  familiarity REAL NOT NULL DEFAULT 0,
  trust REAL NOT NULL DEFAULT 0,
  warmth REAL NOT NULL DEFAULT 0,
  respect REAL NOT NULL DEFAULT 0,
  tension REAL NOT NULL DEFAULT 0,
  interactions INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  mood TEXT NOT NULL DEFAULT 'calm',
  mood_intensity REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, character_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversation_relationships (
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  familiarity REAL NOT NULL DEFAULT 0,
  trust REAL NOT NULL DEFAULT 0,
  warmth REAL NOT NULL DEFAULT 0,
  respect REAL NOT NULL DEFAULT 0,
  tension REAL NOT NULL DEFAULT 0,
  interactions INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  mood TEXT NOT NULL DEFAULT 'calm',
  mood_intensity REAL NOT NULL DEFAULT 0,
  chemistry REAL NOT NULL DEFAULT 0,
  approach_stage TEXT NOT NULL DEFAULT 'stranger',
  PRIMARY KEY(user_id, conversation_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
`);

/*
 * If a user is opening an older database, CREATE TABLE IF NOT EXISTS does not
 * modify an existing table. These checks fill in columns added in Phase 22.
 */
db.exec(`
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
  ON conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user_character_updated
  ON conversations(user_id, character_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_memories_user_character_status
  ON memories(user_id, character_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_conversation_status
  ON memories(user_id, character_id, status, conversation_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_events_created_issue
  ON quality_events(created_at DESC, issue_type);
`);

ensureColumn("conversations", "character_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("conversations", "title", "TEXT NOT NULL DEFAULT 'Nova conversa'");
ensureColumn("conversations", "summary", "TEXT");
ensureColumn("conversations", "summary_updated_at", "INTEGER");
ensureColumn("conversations", "created_at", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("conversations", "updated_at", "INTEGER NOT NULL DEFAULT 0");

ensureColumn("messages", "conversation_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("messages", "sender", "TEXT NOT NULL DEFAULT 'character'");
ensureColumn("messages", "text", "TEXT NOT NULL DEFAULT ''");
ensureColumn("messages", "created_at", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("messages", "edited", "INTEGER NOT NULL DEFAULT 0");

ensureColumn("memories", "character_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("memories", "text", "TEXT NOT NULL DEFAULT ''");
ensureColumn("memories", "source", "TEXT NOT NULL DEFAULT 'automatic'");
ensureColumn("memories", "category", "TEXT");
ensureColumn("memories", "importance", "INTEGER");
ensureColumn("memories", "status", "TEXT NOT NULL DEFAULT 'active'");
ensureColumn("memories", "supersedes_id", "TEXT");
ensureColumn("memories", "message_id", "TEXT");
ensureColumn("memories", "created_at", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("memories", "updated_at", "INTEGER");

ensureColumn("relationships", "character_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("relationships", "familiarity", "REAL NOT NULL DEFAULT 0");
ensureColumn("relationships", "trust", "REAL NOT NULL DEFAULT 0");
ensureColumn("relationships", "warmth", "REAL NOT NULL DEFAULT 0");
ensureColumn("relationships", "respect", "REAL NOT NULL DEFAULT 0");
ensureColumn("relationships", "tension", "REAL NOT NULL DEFAULT 0");
ensureColumn("relationships", "interactions", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("relationships", "updated_at", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("relationships", "mood", "TEXT NOT NULL DEFAULT 'calm'");
ensureColumn("relationships", "mood_intensity", "REAL NOT NULL DEFAULT 0");
ensureColumn("relationships", "chemistry", "REAL NOT NULL DEFAULT 0");
ensureColumn("relationships", "approach_stage", "TEXT NOT NULL DEFAULT 'stranger'");

db.exec(`
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
  ON conversations(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_character
  ON conversations(user_id, character_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_memories_user_character
  ON memories(user_id, character_id, status);

CREATE INDEX IF NOT EXISTS idx_relationships_user
  ON relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_relationships_user_character
  ON conversation_relationships(user_id, character_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
  ON users(username) WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_generation_events_user_provider_created
  ON generation_events(user_id, provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_events_provider_created
  ON generation_events(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_events_user_created
  ON generation_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_events_kind_created
  ON generation_events(kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_events_character_created
  ON generation_events(character_id, created_at DESC);
`);

export function getDb() {
  return db;
}

export function getDatabaseFilePath() { return stableDbPath; }
