import postgres from "postgres";
// @ts-expect-error Node 22+ built-in SQLite module.
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { BETA_EXISTING_CHARACTERS } from "./beta-existing-characters";
import { characters as BUILTIN_CHARACTERS } from "../../characters";

const databaseUrl = String(process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL || "").trim();
const sql = databaseUrl ? postgres(databaseUrl, { prepare: false, max: 4, connect_timeout: 10 }) : null;

export function isPostgresSocialEnabled() {
  return process.env.PERSONACHAT_POSTGRES_SOCIAL === "1";
}

function pg() {
  if (!sql) throw new Error("DATABASE_URL is required for Postgres social mode");
  return sql;
}

function getSqlitePath() {
  const dir = process.env.PERSONACHAT_DATA_DIR
    ? path.resolve(process.env.PERSONACHAT_DATA_DIR)
    : path.join(os.homedir(), ".personachat");
  return path.join(dir, "personachat.db");
}

async function reconcileAdminOwnedBotsFromSqlite(ownerId: string) {
  const db = pg();
  const sqlitePath = getSqlitePath();
  if (!existsSync(sqlitePath)) return { imported: 0, missing: [] as string[] };

  const sqlite = new DatabaseSync(sqlitePath);
  try {
    const sourceRows = sqlite.prepare(`
      SELECT id,owner_id,name,bot_type,description,image,greeting,personality,scenario,speech_style,lore,visibility,real_person_safety,example_messages_json,tags_json,created_at
      FROM user_bots WHERE owner_id=? ORDER BY created_at ASC
    `).all(ownerId) as any[];
    if (!sourceRows.length) return { imported: 0, missing: [] as string[] };

    const imported: string[] = [];
    for (const row of sourceRows) {
      const id = String(row.id);
      const exists = await db`SELECT owner_id FROM user_bots WHERE id=${id} LIMIT 1`;
      if (!exists.length || String(exists[0].owner_id) !== String(ownerId)) {
        await db`INSERT INTO user_bots
          (id,owner_id,name,bot_type,description,image,greeting,personality,scenario,speech_style,lore,visibility,real_person_safety,example_messages_json,tags_json,created_at)
          VALUES (${id},${ownerId},${String(row.name||"")},${String(row.bot_type||"original")},${String(row.description||"")},${String(row.image||"")},${String(row.greeting||"")},${String(row.personality||"")},${String(row.scenario||"")},${String(row.speech_style||"")},${String(row.lore||"")},${String(row.visibility||"public")},${Number(row.real_person_safety||0)},${String(row.example_messages_json||"[]")},${String(row.tags_json||"[]")},${Number(row.created_at||Date.now())})
          ON CONFLICT (id) DO UPDATE SET owner_id=EXCLUDED.owner_id, name=EXCLUDED.name, bot_type=EXCLUDED.bot_type, description=EXCLUDED.description, image=EXCLUDED.image, greeting=EXCLUDED.greeting, personality=EXCLUDED.personality, scenario=EXCLUDED.scenario, speech_style=EXCLUDED.speech_style, lore=EXCLUDED.lore, visibility=EXCLUDED.visibility, real_person_safety=EXCLUDED.real_person_safety, example_messages_json=EXCLUDED.example_messages_json, tags_json=EXCLUDED.tags_json, created_at=EXCLUDED.created_at`;
        imported.push(id);
      }
    }
    return { imported: imported.length, missing: imported };
  } finally {
    sqlite.close();
  }
}

async function reconcileAdminEditorialBots(ownerId: string) {
  const db = pg();
  const configuredEmails = String(process.env.PERSONACHAT_ADMIN_EMAILS || "")
    .split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
  const configuredIds = String(process.env.PERSONACHAT_ADMIN_USER_IDS || "")
    .split(",").map((v) => v.trim()).filter(Boolean);
  const admin = configuredIds.includes(ownerId)
    ? [{ id: ownerId }]
    : configuredEmails.length
      ? await db`SELECT id FROM users WHERE id=${ownerId} AND lower(email) = ANY(${configuredEmails}::text[]) LIMIT 1`
      : [];
  if (!admin.length) return;

  const editorial = [
    ...BETA_EXISTING_CHARACTERS,
    ...BUILTIN_CHARACTERS.filter((c) => ["naruto", "luffy", "revy"].includes(c.id)),
  ];
  const existingRows = await db`SELECT id FROM user_bots WHERE owner_id=${ownerId}`;
  const existing = new Set(existingRows.map((row) => String(row.id)));
  for (const character of editorial) {
    if (existing.has(character.id)) continue;
    await db`INSERT INTO user_bots
      (id,owner_id,name,bot_type,description,image,greeting,personality,scenario,speech_style,lore,visibility,real_person_safety,example_messages_json,tags_json,created_at)
      VALUES (${character.id},${ownerId},${character.name},${character.type},${character.description},${character.image || ""},${character.greeting},${character.personality},${character.scenario},${character.speechStyle || ""},${character.lore || ""},'public',0,${JSON.stringify(character.exampleMessages || [])},${JSON.stringify(character.tags || [])},${Date.now()})
      ON CONFLICT (id) DO UPDATE SET owner_id=EXCLUDED.owner_id, bot_type=EXCLUDED.bot_type, visibility='public'`;
  }
}

export async function listCommunity({ q, mode }: { q: string; mode: "bots" | "creators" }) {
  const db = pg();
  if (mode === "creators") {
    const term = `%${q.toLowerCase()}%`;
    const creators = await db`
      SELECT u.id,u.name,u.username,u.avatar,COUNT(DISTINCT b.id)::int AS bot_count
      FROM users u
      JOIN user_bots b ON b.owner_id=u.id AND b.visibility='public'
      WHERE u.blocked_at IS NULL
        AND (${q} = '' OR LOWER(COALESCE(u.username,'')) LIKE ${term} OR LOWER(u.name) LIKE ${term})
      GROUP BY u.id
      ORDER BY bot_count DESC, u.name ASC
      LIMIT 50`;
    const bots = await db`SELECT b.owner_id,b.id,b.name FROM user_bots b JOIN users u ON u.id=b.owner_id WHERE b.visibility='public' AND u.blocked_at IS NULL ORDER BY b.created_at DESC`;
    const byOwner = new Map<string, {id:string;name:string}[]>();
    for (const bot of bots) {
      const list = byOwner.get(String(bot.owner_id)) ?? [];
      list.push({ id:String(bot.id), name:String(bot.name) });
      byOwner.set(String(bot.owner_id), list);
    }
    return {
      creators: creators.map((c) => {
        const ownerBots = byOwner.get(String(c.id)) ?? [];
        return { id:c.id, name:c.name, username:c.username || `user_${String(c.id).replace(/-/g,'').slice(0,8)}`, avatar:c.avatar ?? null, bots:ownerBots, botCount:ownerBots.length, interactions:0 };
      }),
    };
  }

  const term = `%${q.toLowerCase()}%`;
  const rows = await db`
    SELECT b.*,u.username AS "creatorUsername",
      COALESCE(l.likes,0)::int AS likes,
      COALESCE(i.interactions,0)::int AS interactions
    FROM user_bots b
    JOIN users u ON u.id=b.owner_id
    LEFT JOIN (SELECT bot_id,COUNT(*)::int AS likes FROM bot_likes GROUP BY bot_id) l ON l.bot_id=b.id
    LEFT JOIN (SELECT c.character_id,COUNT(m.id)::int AS interactions FROM conversations c JOIN messages m ON m.conversation_id=c.id AND m.sender='user' GROUP BY c.character_id) i ON i.character_id=b.id
    WHERE b.visibility='public' AND u.blocked_at IS NULL
      AND (${q} = '' OR LOWER(b.name) LIKE ${term} OR LOWER(b.description) LIKE ${term} OR LOWER(COALESCE(u.username,'')) LIKE ${term} OR LOWER(u.name) LIKE ${term} OR LOWER(b.tags_json) LIKE ${term})
    ORDER BY b.created_at DESC`;
  return { rows: rows.map((row) => ({
    id: row.id,
    type: row.bot_type ?? "original",
    name: row.name,
    image: row.image ?? "",
    description: row.description ?? "",
    greeting: row.greeting ?? "",
    personality: row.personality ?? "",
    scenario: row.scenario ?? "",
    speechStyle: row.speech_style ?? "",
    lore: row.lore ?? "",
    visibility: row.visibility === "private" ? "private" : "public",
    tags: JSON.parse(String(row.tags_json || "[]")),
    creator: row.creatorUsername ? `@${row.creatorUsername}` : "@person",
    creatorId: row.owner_id,
    likes: Number(row.likes ?? 0),
    interactions: Number(row.interactions ?? 0),
    createdAt: Number(row.created_at ?? 0),
  })) };
}

export async function getSocialProfile(userId: string, viewerId: string | null) {
  const db = pg();
  await reconcileAdminEditorialBots(userId);
  await reconcileAdminOwnedBotsFromSqlite(userId);
  const row = (await db`SELECT id,name,username,avatar FROM users WHERE id=${userId} AND blocked_at IS NULL LIMIT 1`)[0];
  if (!row) return null;
  const [followersRow, followingRow, bots, likeRow, followRow, createdBotCountRow] = await Promise.all([
    db`SELECT COUNT(*)::int AS count FROM follows WHERE following_id=${userId}`,
    db`SELECT COUNT(*)::int AS count FROM follows WHERE follower_id=${userId}`,
    db`SELECT id,name,bot_type,description,image,greeting,personality,scenario,speech_style,lore,visibility,tags_json,created_at FROM user_bots WHERE owner_id=${userId} AND (${viewerId} = ${userId} OR visibility='public') ORDER BY created_at DESC`,
    viewerId ? db`SELECT 1 FROM profile_likes WHERE user_id=${viewerId} AND profile_user_id=${userId} LIMIT 1` : Promise.resolve([]),
    viewerId ? db`SELECT 1 FROM follows WHERE follower_id=${viewerId} AND following_id=${userId} LIMIT 1` : Promise.resolve([]),
    db`SELECT COUNT(*)::int AS count FROM user_bots WHERE owner_id=${userId}`,
  ]);
  const likedIds = viewerId ? await db`SELECT bot_id FROM bot_likes WHERE user_id=${viewerId} ORDER BY created_at DESC` : [];
  return {
    id: row.id, name: row.name, username: row.username, avatar: row.avatar ?? null,
    createdBotCount: Number(createdBotCountRow[0]?.count ?? bots.length),
    followers: Number(followersRow[0]?.count ?? 0), following: Number(followingRow[0]?.count ?? 0),
    followerCount: Number(followersRow[0]?.count ?? 0), followingCount: Number(followingRow[0]?.count ?? 0),
    liked: likeRow.length > 0, followingYou: false, isFollowing: followRow.length > 0,
    followingList: [], followersList: [], likedBotIds: likedIds.map((x:any) => String(x.bot_id)),
    bots: bots.map((b:any) => ({ id:b.id, name:b.name, type:b.bot_type ?? "original", description:b.description ?? "", image:b.image ?? "", greeting:b.greeting ?? "", personality:b.personality ?? "", scenario:b.scenario ?? "", speechStyle:b.speech_style ?? "", lore:b.lore ?? "", visibility:b.visibility, tags:JSON.parse(String(b.tags_json || "[]")), createdAt:Number(b.created_at ?? 0), creator: row.username ? `@${row.username}` : "@person", creatorId: row.id })),
  };
}

export async function toggleBotLike(userId: string, botId: string) {
  const db = pg();
  const existing = await db`SELECT 1 FROM bot_likes WHERE user_id=${userId} AND bot_id=${botId}`;
  if (existing.length) { await db`DELETE FROM bot_likes WHERE user_id=${userId} AND bot_id=${botId}`; return false; }
  await db`INSERT INTO bot_likes(user_id,bot_id,created_at) VALUES(${userId},${botId},${Date.now()}) ON CONFLICT DO NOTHING`; return true;
}
export async function toggleProfileLike(userId: string, targetId: string) {
  if (userId === targetId) throw new Error("CANNOT_LIKE_SELF");
  const db = pg();
  const existing = await db`SELECT 1 FROM profile_likes WHERE user_id=${userId} AND profile_user_id=${targetId}`;
  if (existing.length) { await db`DELETE FROM profile_likes WHERE user_id=${userId} AND profile_user_id=${targetId}`; return false; }
  await db`INSERT INTO profile_likes(user_id,profile_user_id,created_at) VALUES(${userId},${targetId},${Date.now()}) ON CONFLICT DO NOTHING`; return true;
}
export async function toggleFollow(userId: string, targetId: string) {
  if (userId === targetId) throw new Error("CANNOT_FOLLOW_SELF");
  const db = pg();
  const existing = await db`SELECT 1 FROM follows WHERE follower_id=${userId} AND following_id=${targetId}`;
  if (existing.length) { await db`DELETE FROM follows WHERE follower_id=${userId} AND following_id=${targetId}`; return false; }
  await db`INSERT INTO follows(follower_id,following_id,created_at) VALUES(${userId},${targetId},${Date.now()}) ON CONFLICT DO NOTHING`; return true;
}
export async function saveResponseFeedback({ userId, messageId, value, tags, note, createdAt }: { userId:string;messageId:string;value:string;tags:string[];note:string;createdAt:number }) {
  const db = pg();
  await db`INSERT INTO response_feedback(user_id,message_id,value,created_at,tags_json,note) VALUES(${userId},${messageId},${value},${createdAt},${JSON.stringify(tags)},${note}) ON CONFLICT(user_id,message_id) DO UPDATE SET value=EXCLUDED.value,created_at=EXCLUDED.created_at,tags_json=EXCLUDED.tags_json,note=EXCLUDED.note`;
}
export async function saveProductFeedback({ id,userId,category,text,createdAt }: { id:string;userId:string;category:string;text:string;createdAt:number }) {
  const db = pg(); await db`INSERT INTO product_feedback(id,user_id,category,text,created_at) VALUES(${id},${userId},${category},${text},${createdAt}) ON CONFLICT(id) DO NOTHING`;
}
export async function findOpenDuplicateReport({ reporterId,targetType,targetId,messageId }: { reporterId:string;targetType:string;targetId:string;messageId:string|null }) {
  const db = pg();
  const rows = await db`SELECT id FROM reports WHERE reporter_id=${reporterId} AND target_type=${targetType} AND target_id=${targetId} AND COALESCE(message_id,'')=COALESCE(${messageId},'') AND status IN ('pending','reviewing') LIMIT 1`;
  return rows[0] ?? null;
}
export async function createReport({ id,reporterId,targetType,targetId,messageId,reason,details,evidence,createdAt }: { id:string;reporterId:string;targetType:string;targetId:string;messageId:string|null;reason:string;details:string;evidence:Record<string,unknown>;createdAt:number }) {
  const db = pg(); await db`INSERT INTO reports(id,reporter_id,target_type,target_id,message_id,reason,details,evidence_json,status,priority,created_at,updated_at) VALUES(${id},${reporterId},${targetType},${targetId},${messageId},${reason},${details},${JSON.stringify(evidence)},'pending','normal',${createdAt},${createdAt})`;
}
export async function reportExists(id:string) { const db=pg(); return (await db`SELECT 1 FROM reports WHERE id=${id} LIMIT 1`).length>0; }
export async function listAdminReports(status:string|null) { const db=pg(); return status ? db`SELECT r.*,u.username AS reporter_username FROM reports r JOIN users u ON u.id=r.reporter_id WHERE r.status=${status} ORDER BY r.created_at DESC LIMIT 200` : db`SELECT r.*,u.username AS reporter_username FROM reports r JOIN users u ON u.id=r.reporter_id ORDER BY r.created_at DESC LIMIT 200`; }
export async function updateAdminReport({ id,status,priority,note,resolvedBy,updatedAt }: { id:string;status:string;priority:string|null;note:string;resolvedBy:string;updatedAt:number }) {
  const db=pg(); const resolvedAt=(status === "resolved" || status === "dismissed") ? updatedAt : null;
  await db`UPDATE reports SET status=${status},priority=COALESCE(${priority},priority),resolution_note=${note},resolved_by=${resolvedBy},updated_at=${updatedAt},resolved_at=${resolvedAt} WHERE id=${id}`;
}
