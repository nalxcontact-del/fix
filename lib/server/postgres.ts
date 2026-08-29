import postgres from "postgres";

let client: ReturnType<typeof postgres> | null = null;

function getConnectionString() {
  const value = String(process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL || "").trim();
  if (!value) throw new Error("DATABASE_URL is not configured");
  return value;
}

/**
 * Server-only PostgreSQL client for the production data plane.
 * Supabase transaction-pooler connections must disable prepared statements.
 */
export function getPostgres() {
  if (!client) {
    client = postgres(getConnectionString(), {
      max: Number(process.env.PERSONACHAT_PG_MAX_CONNECTIONS || 5),
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
    });
  }
  return client;
}

export function isPostgresConfigured() {
  return Boolean(String(process.env.DATABASE_URL || process.env.DATABASE_POOLER_URL || "").trim());
}
