import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [
  ["usage accounting module exists", fs.existsSync(path.join(root, "lib/server/usage.ts"))],
  ["provider usage is persisted", read("lib/server/usage.ts").includes("recordGeneration") && read("lib/server/db.ts").includes("total_tokens")],
  ["daily usage is isolated per provider", read("lib/server/usage.ts").includes("provider = ?") && read("lib/server/db.ts").includes("provider TEXT")],
  ["legacy usage is classified during migration", read("lib/server/db.ts").includes("LIKE '%gemini%'") && read("lib/server/db.ts").includes("ELSE 'groq'")],
  ["input/output token columns exist", /prompt_tokens INTEGER.*completion_tokens INTEGER.*total_tokens INTEGER/s.test(read("lib/server/db.ts"))],
  ["user daily token limits exist", read("lib/server/usage.ts").includes("PERSONACHAT_FREE_DAILY_TOKENS")],
  ["user monthly token limits exist", read("lib/server/usage.ts").includes("PERSONACHAT_FREE_MONTHLY_TOKENS")],
  ["premium limits are separated", read("lib/server/usage.ts").includes("PERSONACHAT_PREMIUM_DAILY_TOKENS")],
  ["global token guard exists", read("lib/server/usage.ts").includes("PERSONACHAT_GLOBAL_DAILY_TOKENS")],
  ["optional global dollar guard exists", read("lib/server/usage.ts").includes("PERSONACHAT_GLOBAL_DAILY_USD")],
  ["chat performs preflight admission", read("app/api/chat/route.ts").includes("checkGenerationBudget")],
  ["chat records successful generation usage", read("app/api/chat/route.ts").includes("recordProviderUsage")],
  ["quality retry is budget checked", read("app/api/chat/route.ts").includes("retryAdmission")],
  ["API key remains server-side", read("app/api/chat/route.ts").includes("process.env.GEMINI_API_KEY") && !read("app/api/chat/route.ts").includes("NEXT_PUBLIC_GEMINI_API_KEY")],
  ["SQLite migrations tolerate concurrent duplicate-column races", read("lib/server/db.ts").includes("duplicate column name") && read("lib/server/db.ts").includes("columnExists(table, column)")],
  ["SQLite busy timeout is configured before WAL initialization", read("lib/server/db.ts").includes("PRAGMA busy_timeout = 10000") && read("lib/server/db.ts").indexOf("PRAGMA busy_timeout = 10000") < read("lib/server/db.ts").indexOf("PRAGMA journal_mode = WAL")],
];
let ok = 0;
for (const [name, pass] of checks) { console.log(`${pass ? "OK" : "FAIL"} — ${name}`); if (pass) ok++; }
console.log(`Phase 32 usage/cost checks: ${ok}/${checks.length} OK`);
if (ok !== checks.length) process.exit(1);
