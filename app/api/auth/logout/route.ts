import { NextResponse } from "next/server";
import { destroySession } from "@/lib/server/session";
import { rateLimit, requireSameOrigin } from "@/lib/server/security";
export async function POST(req: Request) {
  const limit = rateLimit(req, "auth-logout", 20);
  if (!limit.allowed) return NextResponse.json({ error: "Muitas requisições." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  try { requireSameOrigin(req); } catch { return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 }); }
  await destroySession();
  return NextResponse.json({ ok: true });
}
