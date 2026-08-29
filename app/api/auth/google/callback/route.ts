import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/lib/server/db";
import { hashPassword, rateLimit } from "@/lib/server/security";
import { createSession } from "@/lib/server/session";
import { isPostgresAccountsEnabled, findUserByGoogleSub, findUserByEmail, findUserByUsername, createUser as createPostgresUser, updateGoogleUser } from "@/lib/server/postgres-accounts";

const STATE_COOKIE = "personachat_google_oauth_state";

function publicBaseUrl(req: Request) {
  const configured = String(process.env.PERSONACHAT_PUBLIC_URL || "").trim().replace(/\/$/, "");
  return configured || new URL(req.url).origin;
}

function redirectWithError(req: Request, reason: string) {
  return NextResponse.redirect(new URL(`/?auth=google_error&reason=${encodeURIComponent(reason)}`, publicBaseUrl(req)));
}

async function generateUsername(db: ReturnType<typeof getDb>) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const username = `user_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    if (!(isPostgresAccountsEnabled() ? await findUserByUsername(username) : db.prepare("SELECT 1 FROM users WHERE username=?").get(username))) return username;
  }
  throw new Error("USERNAME_GENERATION_FAILED");
}

export async function GET(req: Request) {
  const limit = rateLimit(req, "auth-google-callback", 10);
  if (!limit.allowed) return redirectWithError(req, "rate_limited");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (url.searchParams.get("error")) return redirectWithError(req, "cancelled");
  if (!code || !returnedState || !expectedState || returnedState.length > 256 || expectedState !== returnedState) return redirectWithError(req, "invalid_state");

  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) return redirectWithError(req, "not_configured");
  const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || `${publicBaseUrl(req)}/api/auth/google/callback`).trim();

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      cache: "no-store",
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }).toString(),
    });
    if (!tokenResponse.ok) return redirectWithError(req, "token_exchange");
    const token = await tokenResponse.json() as { access_token?: unknown; token_type?: unknown };
    const accessToken = typeof token.access_token === "string" ? token.access_token : "";
    if (!accessToken || String(token.token_type || "").toLowerCase() !== "bearer") return redirectWithError(req, "token_exchange");

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    if (!profileResponse.ok) return redirectWithError(req, "profile_lookup");
    const profile = await profileResponse.json() as { sub?: unknown; email?: unknown; email_verified?: unknown; name?: unknown; picture?: unknown };
    const googleSub = typeof profile.sub === "string" ? profile.sub.trim() : "";
    const email = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
    const verified = profile.email_verified === true;
    const name = typeof profile.name === "string" ? profile.name.trim().slice(0, 30) : "";
    const avatar = typeof profile.picture === "string" ? profile.picture.trim().slice(0, 2000) : "";
    if (!googleSub || !email || !verified) return redirectWithError(req, "unverified_account");

    const db = getDb();
    const existingByGoogle = isPostgresAccountsEnabled() ? await findUserByGoogleSub(googleSub) : db.prepare("SELECT id FROM users WHERE google_sub=?").get(googleSub) as { id?: string } | undefined;
    let userId = existingByGoogle?.id;
    if (!userId) {
      const existingByEmail = isPostgresAccountsEnabled() ? await findUserByEmail(email) : db.prepare("SELECT id, google_sub FROM users WHERE email=?").get(email) as { id?: string; google_sub?: string | null } | undefined;
      if (existingByEmail?.id) {
        if (existingByEmail.google_sub && existingByEmail.google_sub !== googleSub) return redirectWithError(req, "account_conflict");
        if (isPostgresAccountsEnabled()) await updateGoogleUser(String(existingByEmail.id), googleSub, avatar);
        else db.prepare("UPDATE users SET google_sub=?, avatar=CASE WHEN ? <> '' THEN ? ELSE avatar END WHERE id=?").run(googleSub, avatar, avatar, existingByEmail.id);
        userId = existingByEmail.id;
      } else {
        userId = randomUUID();
        const createdAt = Date.now();
        const username = await generateUsername(db);
        const unusablePassword = hashPassword(randomUUID() + randomUUID());
        if (isPostgresAccountsEnabled()) await createPostgresUser({ id: userId, name: name || "Google User", email, username, passwordHash: unusablePassword, createdAt, avatar: avatar || null });
      else db.prepare("INSERT INTO users (id,name,email,username,password_hash,created_at,avatar,google_sub) VALUES (?,?,?,?,?,?,?,?)").run(userId, name || "Google User", email, username, unusablePassword, createdAt, avatar || null, googleSub);
      if (isPostgresAccountsEnabled()) await updateGoogleUser(userId, googleSub, avatar || null);
        db.prepare("INSERT INTO app_data (user_id, conversations_json, memories_json, relationships_json, updated_at) VALUES (?, '[]', '[]', '{}', ?)").run(userId, createdAt);
      }
    }

    await createSession(userId);
    return NextResponse.redirect(new URL("/", publicBaseUrl(req)));
  } catch (error) {
    console.error("Google authentication failed:", error);
    return redirectWithError(req, "server_error");
  }
}
