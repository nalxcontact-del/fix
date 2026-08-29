import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { isPostgresAccountsEnabled, findUserByEmail, deleteUser as deletePostgresUser } from "@/lib/server/postgres-accounts";
import { getCurrentUser, destroySession } from "@/lib/server/session";
import { verifyPassword, readJsonBody, enforceBodySize, rateLimit, requireSameOrigin } from "@/lib/server/security";

export async function POST(req: Request) {
  const limit = rateLimit(req, "auth-delete-account", 3);
  if (!limit.allowed) return NextResponse.json({ error: "Muitas tentativas. Tente novamente mais tarde." }, { status: 429 });
  try {
    enforceBodySize(req, 16 * 1024);
    requireSameOrigin(req);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    const body = await readJsonBody<{ email?: unknown; password?: unknown }>(req, 16 * 1024);
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const db = getDb();
    const row = isPostgresAccountsEnabled() ? await findUserByEmail(user.email) : db.prepare("SELECT id,email,password_hash FROM users WHERE id=?").get(user.id) as any;
    if (!row || email !== String(row.email).toLowerCase() || !verifyPassword(password, row.password_hash)) {
      return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    }
    if (isPostgresAccountsEnabled()) await deletePostgresUser(user.id); else db.prepare("DELETE FROM users WHERE id=?").run(user.id);
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to delete the account." }, { status: 500 });
  }
}
