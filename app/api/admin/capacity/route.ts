import { NextResponse } from "next/server";
import { getCurrentUser, isConfiguredAdmin } from "@/lib/server/session";
import { getPostgres, isPostgresConfigured } from "@/lib/server/postgres";
import { getCapacitySettings, setCapacityLimit } from "@/lib/server/capacity";
import { enforceBodySize, readJsonBody, rateLimit, requireSameOrigin } from "@/lib/server/security";
import { randomUUID } from "node:crypto";

async function requireAdmin() {
  const user = await getCurrentUser();
  return user && isConfiguredAdmin(user.id, user.email) ? user : null;
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "admin-capacity-read", 30, 60_000);
  if (!limited.allowed) return NextResponse.json({ error:"Muitas consultas." }, { status:429 });
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error:"Acesso negado." }, { status:403 });
  if (!isPostgresConfigured() || process.env.PERSONACHAT_POSTGRES_CONTROL !== "1") {
    return NextResponse.json({ error:"Controle de capacidade persistente requer o Postgres de produção.", code:"POSTGRES_CONTROL_REQUIRED" }, { status:503 });
  }
  return NextResponse.json({ settings: await getCapacitySettings() }, { headers:{ "Cache-Control":"no-store" } });
}

export async function PATCH(request: Request) {
  const limited = rateLimit(request, "admin-capacity-write", 20, 60_000);
  if (!limited.allowed) return NextResponse.json({ error:"Muitas alterações em pouco tempo." }, { status:429 });
  try { requireSameOrigin(request); enforceBodySize(request, 4_000); }
  catch (error) { return NextResponse.json({ error:error instanceof Error && error.message==="BODY_TOO_LARGE" ? "Requisição muito grande." : "Origem não permitida." }, { status:error instanceof Error && error.message==="BODY_TOO_LARGE" ? 413 : 403 }); }
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error:"Acesso negado." }, { status:403 });
  if (!isPostgresConfigured() || process.env.PERSONACHAT_POSTGRES_CONTROL !== "1") return NextResponse.json({ error:"Controle de capacidade persistente requer o Postgres de produção.", code:"POSTGRES_CONTROL_REQUIRED" }, { status:503 });
  const body = await readJsonBody<{ capacity?:unknown }>(request, 4_000);
  const capacity = Number(body.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10_000) return NextResponse.json({ error:"A capacidade deve ser um número inteiro entre 1 e 10.000." }, { status:400 });
  try {
    const settings = await setCapacityLimit(capacity, admin.id);
    const sql = getPostgres();
    await sql`INSERT INTO admin_audit_log(id,admin_user_id,action,target_type,target_id,details_json,created_at)
      VALUES(${randomUUID()},${admin.id},'capacity_limit_changed','system','beta_capacity',${JSON.stringify({capacity})},${Date.now()})`;
    return NextResponse.json({ ok:true, settings });
  } catch (error) {
    console.error("[ADMIN CAPACITY]", error);
    return NextResponse.json({ error:error instanceof Error ? error.message : "Não foi possível alterar a capacidade." }, { status:500 });
  }
}
