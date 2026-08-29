import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/server/db";
import { verifyPassword } from "@/lib/server/security";
import { createSession } from "@/lib/server/session";
import { enforceBodySize, readJsonBody, rateLimit, requireSameOrigin, securityFailure } from "@/lib/server/security";
import { isPostgresAccountsEnabled, findUserByEmail, updateUsernameIfMissing } from "@/lib/server/postgres-accounts";

export async function POST(req: Request) {
  const limit = rateLimit(req, "auth-login", 8);
  if (!limit.allowed) return NextResponse.json({ error: "Muitas tentativas. Tente novamente em instantes." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  try {
    enforceBodySize(req, 16 * 1024);
    requireSameOrigin(req);
    const { email, password } = await readJsonBody<{ email?: unknown; password?: unknown }>(req, 16 * 1024);
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    const cleanPassword = String(password ?? "");
    if (!cleanEmail || !cleanPassword || cleanPassword.length > 256) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
    const row = isPostgresAccountsEnabled() ? await findUserByEmail(cleanEmail) : getDb().prepare("SELECT id,name,email,username,password_hash,created_at,avatar,gender FROM users WHERE email=?").get(cleanEmail) as any;
    if (!row || !verifyPassword(cleanPassword, row.password_hash)) return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    let username = row.username as string | null;
    if (!username) {
      for (let attempt = 0; attempt < 20 && !username; attempt += 1) {
        const candidate = `user_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
        try {
          if (isPostgresAccountsEnabled()) username = await updateUsernameIfMissing(String(row.id), candidate);
          else { getDb().prepare("UPDATE users SET username=? WHERE id=? AND username IS NULL").run(candidate, row.id); username = candidate; }
        } catch {
          // A collision is extremely unlikely; try another candidate.
        }
      }
      if (!username) return NextResponse.json({ error: "Unable to prepare your username." }, { status: 500 });
    }
    await createSession(row.id);
    return NextResponse.json({ user: { id: row.id, name: row.name, username, email: row.email, createdAt: row.created_at, avatar: row.avatar ?? null, gender: row.gender === "female" || row.gender === "male" ? row.gender : null } });
  } catch (error) {
    const failure = securityFailure(error);
    if (failure === "BODY_TOO_LARGE") return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    if (failure === "BAD_ORIGIN") return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
    console.error(error);
    return NextResponse.json({ error: "Unable to sign in." }, { status: 500 });
  }
}
