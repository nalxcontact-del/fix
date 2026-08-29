import { cookies } from "next/headers";
import { getDb } from "./db";
import { hashToken, newSessionToken } from "./security";
import { isPostgresAccountsEnabled, createSession as createPostgresSession, getSessionUser, deleteSession as deletePostgresSession } from "./postgres-accounts";

const COOKIE = "personachat_session";
const DAYS = 30;
const MAX_SESSIONS_PER_USER = 5;

export type ServerUser = { id: string; name: string; username: string; email: string; createdAt: number; avatar?: string | null; gender?: "female" | "male" | null; plan?: "free" | "premium"; isAdmin?: boolean };


export function isConfiguredAdmin(userId: string, email?: string) {
  const ids = String(process.env.PERSONACHAT_ADMIN_USER_IDS || "")
    .split(",").map((x) => x.trim()).filter(Boolean);
  const configuredEmails = String(process.env.PERSONACHAT_ADMIN_EMAILS || "")
    .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const emails = Array.from(new Set(configuredEmails));
  return ids.includes(userId) || (!!email && emails.includes(email.trim().toLowerCase()));
}

export async function createSession(userId: string) {
  const token = newSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = Date.now() + DAYS * 24 * 60 * 60 * 1000;
  if (isPostgresAccountsEnabled()) {
    await createPostgresSession(userId, tokenHash, expiresAt, MAX_SESSIONS_PER_USER);
    (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: DAYS * 24 * 60 * 60 });
    return;
  }
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  const activeCount = Number((db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id=?").get(userId) as any)?.count ?? 0);
  if (activeCount >= MAX_SESSIONS_PER_USER) {
    db.prepare(`DELETE FROM sessions WHERE token_hash IN (
      SELECT token_hash FROM sessions WHERE user_id=? ORDER BY expires_at ASC LIMIT ?
    )`).run(userId, activeCount - MAX_SESSIONS_PER_USER + 1);
  }
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(tokenHash, userId, expiresAt);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: DAYS * 24 * 60 * 60 });
}

export async function getCurrentUser(): Promise<ServerUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  if (isPostgresAccountsEnabled()) {
    const pgUser = await getSessionUser(hashToken(token));
    if (!pgUser) return null;
    const admin = isConfiguredAdmin(pgUser.id, pgUser.email);
    return admin ? { ...pgUser, plan: "premium", isAdmin: true } : { ...pgUser, isAdmin: false };
  }
  const row = getDb().prepare(`SELECT u.id, u.name, u.username, u.email, u.created_at AS createdAt, u.avatar AS avatar, u.gender AS gender, u.plan AS plan, u.blocked_at AS blockedAt, u.blocked_reason AS blockedReason, s.expires_at AS expiresAt
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).get(hashToken(token)) as any;
  if (!row) return null;
  if (row.blockedAt) {
    getDb().prepare("DELETE FROM sessions WHERE token_hash=?").run(hashToken(token));
    return null;
  }
  if (row.expiresAt < Date.now()) {
    getDb().prepare("DELETE FROM sessions WHERE token_hash=?").run(hashToken(token));
    return null;
  }
  const admin = isConfiguredAdmin(String(row.id), String(row.email || ""));
  return { id: row.id, name: row.name, username: row.username || `user_${String(row.id).slice(0, 6)}`, email: row.email, createdAt: row.createdAt, avatar: row.avatar ?? null, gender: row.gender === "female" || row.gender === "male" ? row.gender : null, plan: admin ? "premium" : (row.plan === "premium" ? "premium" : "free"), isAdmin: admin };
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    if (isPostgresAccountsEnabled()) await deletePostgresSession(hashToken(token));
    else getDb().prepare("DELETE FROM sessions WHERE token_hash=?").run(hashToken(token));
  }
  store.delete(COOKIE);
}
