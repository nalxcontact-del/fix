import { assertProductionCutoverReady } from "./production-cutover";

export type ProductionConfig = {
  databaseMode: "sqlite" | "supabase";
  redisConfigured: boolean;
  storageConfigured: boolean;
  analyticsConfigured: boolean;
  requireProductionPostgres: boolean;
};

export function getProductionConfig(): ProductionConfig {
  const supabaseConfigured = Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const redisConfigured = Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
  const storageConfigured = supabaseConfigured && Boolean(process.env.SUPABASE_STORAGE_BUCKET?.trim());
  const analyticsConfigured = supabaseConfigured;
  const requireProductionPostgres = process.env.PERSONACHAT_REQUIRE_POSTGRES === "1" || process.env.NODE_ENV === "production";
  return {
    databaseMode: supabaseConfigured ? "supabase" : "sqlite",
    redisConfigured,
    storageConfigured,
    analyticsConfigured,
    requireProductionPostgres,
  };
}

export function assertProductionFoundation() {
  const config = getProductionConfig();
  assertProductionCutoverReady();
  if (config.requireProductionPostgres && !config.analyticsConfigured) {
    throw new Error("PRODUCTION_POSTGRES_REQUIRED: configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before production.");
  }
  return config;
}
