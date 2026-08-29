import { isPostgresConfigured } from "./postgres";
import { isPostgresAccountsEnabled } from "./postgres-accounts";
import { isPostgresChatEnabled } from "./postgres-chat";
import { isPostgresSocialEnabled } from "./postgres-social";
import { isPostgresControlEnabled } from "./postgres-control";

export const POSTGRES_CUTOVER_FLAG = "PERSONACHAT_PRODUCTION_POSTGRES";

export type ProductionCutoverStatus = {
  requested: boolean;
  ready: boolean;
  databaseConfigured: boolean;
  accounts: boolean;
  chat: boolean;
  social: boolean;
  control: boolean;
  missing: string[];
};

export function getProductionCutoverStatus(): ProductionCutoverStatus {
  const requested = process.env[POSTGRES_CUTOVER_FLAG] === "1";
  const databaseConfigured = isPostgresConfigured();
  const accounts = isPostgresAccountsEnabled();
  const chat = isPostgresChatEnabled();
  const social = isPostgresSocialEnabled();
  const control = isPostgresControlEnabled();
  const missing: string[] = [];
  if (!databaseConfigured) missing.push("DATABASE_URL/DATABASE_POOLER_URL");
  if (!accounts) missing.push("PERSONACHAT_POSTGRES_ACCOUNTS=1");
  if (!chat) missing.push("PERSONACHAT_POSTGRES_CHAT=1");
  if (!social) missing.push("PERSONACHAT_POSTGRES_SOCIAL=1");
  if (!control) missing.push("PERSONACHAT_POSTGRES_CONTROL=1");
  return { requested, ready: databaseConfigured && accounts && chat && social && control, databaseConfigured, accounts, chat, social, control, missing };
}

export function assertProductionCutoverReady() {
  if (process.env.NODE_ENV !== "production" || process.env[POSTGRES_CUTOVER_FLAG] !== "1") return getProductionCutoverStatus();
  const status = getProductionCutoverStatus();
  if (!status.ready) throw new Error(`PRODUCTION_POSTGRES_CUTOVER_INCOMPLETE:${status.missing.join(",")}`);
  return status;
}
