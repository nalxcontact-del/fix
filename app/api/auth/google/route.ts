import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { rateLimit } from "@/lib/server/security";

const STATE_COOKIE = "personachat_google_oauth_state";
const STATE_MAX_AGE = 10 * 60;

function getPublicBaseUrl(req: Request) {
  const configured = String(process.env.PERSONACHAT_PUBLIC_URL || "").trim().replace(/\/$/, "");
  return configured || new URL(req.url).origin;
}

export async function GET(req: Request) {
  const limit = rateLimit(req, "auth-google-start", 10);
  if (!limit.allowed) return NextResponse.json({ error: "Too many sign-in attempts. Please try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) return NextResponse.redirect(new URL("/?auth=google_error&reason=not_configured", req.url));

  const state = randomBytes(32).toString("base64url");
  const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || `${getPublicBaseUrl(req)}/api/auth/google/callback`).trim();
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, prompt: "select_account" });
  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  response.cookies.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: STATE_MAX_AGE });
  return response;
}
