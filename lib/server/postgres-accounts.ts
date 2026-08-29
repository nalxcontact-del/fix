import { getPostgres, isPostgresConfigured } from "./postgres";
import type { ServerUser } from "./session";

export function isPostgresAccountsEnabled() {
  return process.env.PERSONACHAT_POSTGRES_ACCOUNTS === "1" && isPostgresConfigured();
}

function pg() {
  if (!isPostgresAccountsEnabled()) throw new Error("POSTGRES_ACCOUNTS_DISABLED");
  return getPostgres();
}

export async function findUserByEmail(email: string) {
  const sql = pg();
  const rows = await sql`SELECT id,name,email,username,password_hash,created_at,avatar,gender,plan,blocked_at,blocked_reason,google_sub FROM users WHERE lower(email)=lower(${email}) LIMIT 1`;
  return rows[0] ?? null;
}

export async function findUserByUsername(username: string) {
  const sql = pg();
  const rows = await sql`SELECT id,name,email,username,password_hash,created_at,avatar,gender,plan,blocked_at,blocked_reason,google_sub FROM users WHERE username=${username} LIMIT 1`;
  return rows[0] ?? null;
}

export async function findUserByGoogleSub(googleSub: string) {
  const sql = pg();
  const rows = await sql`SELECT id,name,email,username,password_hash,created_at,avatar,gender,plan,blocked_at,blocked_reason,google_sub FROM users WHERE google_sub=${googleSub} LIMIT 1`;
  return rows[0] ?? null;
}

export async function createUser(input: {
  id: string; name: string; email: string; username: string; passwordHash: string; createdAt: number; avatar?: string | null; gender?: string | null; plan?: string;
}) {
  const sql = pg();
  await sql`INSERT INTO users (id,name,email,username,password_hash,created_at,avatar,gender,plan) VALUES (${input.id},${input.name},${input.email},${input.username},${input.passwordHash},${input.createdAt},${input.avatar ?? null},${input.gender ?? null},${input.plan ?? "free"})`;
}

export async function updateUserProfile(id: string, input: { name: string; username: string; avatar?: string | null; gender?: string | null }) {
  const sql = pg();
  await sql`UPDATE users SET name=${input.name},username=${input.username},avatar=${input.avatar ?? null},gender=${input.gender ?? null} WHERE id=${id}`;
}

export async function updateUsernameIfMissing(id: string, username: string) {
  const sql = pg();
  const rows = await sql`UPDATE users SET username=${username} WHERE id=${id} AND username IS NULL RETURNING username`;
  return rows[0]?.username ? String(rows[0].username) : null;
}

export async function updateGoogleUser(id: string, googleSub: string, avatar: string | null) {
  const sql = pg();
  await sql`UPDATE users SET google_sub=${googleSub}, avatar=CASE WHEN ${avatar ?? ""} <> '' THEN ${avatar} ELSE avatar END WHERE id=${id}`;
}

export async function createSession(userId: string, tokenHash: string, expiresAt: number, maxSessions = 5) {
  const sql = pg();
  await sql.begin(async (tx) => {
    await tx`DELETE FROM sessions WHERE expires_at < ${Date.now()}`;
    const countRows = await tx`SELECT COUNT(*)::int AS count FROM sessions WHERE user_id=${userId}`;
    const count = Number(countRows[0]?.count ?? 0);
    if (count >= maxSessions) {
      await tx`DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE user_id=${userId} ORDER BY expires_at ASC LIMIT ${count - maxSessions + 1})`;
    }
    await tx`INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (${tokenHash},${userId},${expiresAt})`;
  });
}

export async function getSessionUser(tokenHash: string): Promise<ServerUser | null> {
  const sql = pg();
  const rows = await sql`SELECT u.id,u.name,u.username,u.email,u.created_at,u.avatar,u.gender,u.plan,u.blocked_at,u.blocked_reason,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=${tokenHash} LIMIT 1`;
  const row = rows[0] as any;
  if (!row) return null;
  if (row.blocked_at || Number(row.expires_at) < Date.now()) {
    await deleteSession(tokenHash);
    return null;
  }
  return { id: String(row.id), name: String(row.name), username: String(row.username || `user_${String(row.id).slice(0,6)}`), email: String(row.email), createdAt: Number(row.created_at), avatar: row.avatar ?? null, gender: row.gender === "female" || row.gender === "male" ? row.gender : null, plan: row.plan === "premium" ? "premium" : "free" };
}

export async function deleteSession(tokenHash: string) {
  const sql = pg();
  await sql`DELETE FROM sessions WHERE token_hash=${tokenHash}`;
}

export async function deleteUser(id: string) {
  const sql = pg();
  await sql`DELETE FROM users WHERE id=${id}`;
}

export async function listOwnedBots(ownerId: string) {
  const sql = pg();
  return sql`SELECT id,owner_id,name,bot_type,description,image,greeting,personality,scenario,speech_style,lore,visibility,real_person_safety,example_messages_json,tags_json,created_at FROM user_bots WHERE owner_id=${ownerId} ORDER BY created_at DESC`;
}

export async function getBot(ownerId: string, botId: string) {
  const sql = pg();
  const rows = await sql`SELECT id,owner_id,name,bot_type,description,image,greeting,personality,scenario,speech_style,lore,visibility,real_person_safety,example_messages_json,tags_json,created_at FROM user_bots WHERE id=${botId} LIMIT 1`;
  return rows[0] ?? null;
}

export async function countOwnedBots(ownerId: string) {
  const sql = pg();
  const rows = await sql`SELECT COUNT(*)::int AS count FROM user_bots WHERE owner_id=${ownerId}`;
  return Number(rows[0]?.count ?? 0);
}

export async function upsertBot(input: {
  id: string; ownerId: string; name: string; botType: string; description: string; image: string; greeting: string; personality: string; scenario: string; speechStyle: string; lore: string; visibility: string; realPersonSafety: boolean; exampleMessages: string[]; tags: string[]; createdAt: number;
}) {
  const sql = pg();
  await sql`INSERT INTO user_bots (id,owner_id,name,bot_type,description,image,greeting,personality,scenario,speech_style,lore,visibility,real_person_safety,example_messages_json,tags_json,created_at) VALUES (${input.id},${input.ownerId},${input.name},${input.botType},${input.description},${input.image},${input.greeting},${input.personality},${input.scenario},${input.speechStyle},${input.lore},${input.visibility},${input.realPersonSafety ? 1 : 0},${JSON.stringify(input.exampleMessages)},${JSON.stringify(input.tags)},${input.createdAt})`;
}

export async function updateBot(input: Omit<Parameters<typeof upsertBot>[0], "createdAt">) {
  const sql = pg();
  await sql`UPDATE user_bots SET name=${input.name},bot_type=${input.botType},description=${input.description},image=${input.image},greeting=${input.greeting},personality=${input.personality},scenario=${input.scenario},speech_style=${input.speechStyle},lore=${input.lore},visibility=${input.visibility},real_person_safety=${input.realPersonSafety ? 1 : 0},example_messages_json=${JSON.stringify(input.exampleMessages)},tags_json=${JSON.stringify(input.tags)} WHERE id=${input.id} AND owner_id=${input.ownerId}`;
}

export async function deleteBot(ownerId: string, botId: string) {
  const sql = pg();
  await sql.begin(async (tx) => {
    await tx`DELETE FROM bot_likes WHERE bot_id=${botId}`;
    await tx`DELETE FROM user_bots WHERE id=${botId} AND owner_id=${ownerId}`;
  });
}
