import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const route = read("app/api/reports/route.ts");
const checks = [
  ["reports API exists", fs.existsSync(path.join(root, "app/api/reports/route.ts"))],
  ["reports table exists", read("lib/server/db.ts").includes("CREATE TABLE IF NOT EXISTS reports")],
  ["reports use rate limiting", route.includes("reports-create") && route.includes("rateLimit(")],
  ["reports validate origin", route.includes("requireSameOrigin(")],
  ["reports bound body", route.includes("readJsonBody") && route.includes("MAX_BODY_BYTES")],
  ["reports reject oversized mutation bodies with 413", route.includes("BODY_TOO_LARGE") && route.includes("status: tooLarge ? 413 : 403")],
  ["reports prevent duplicate pending cases", route.includes("status IN ('pending','reviewing')")],
  ["message reports validate target relationship", route.includes("row.character_id !== targetId")],
  ["messageId is rejected for non-message targets", route.includes("messageId can only be used when reporting a message")],
  ["admin endpoint is server protected", route.includes("isConfiguredAdmin")],
  ["admin actions have separate rate limits", route.includes("reports-admin-read") && route.includes("reports-admin-write")],
  ["policy page exists", fs.existsSync(path.join(root, "app/policies/page.tsx"))],
  ["policy page warns about legal review", read("app/policies/page.tsx").includes("legal review")],
  ["admin IDs are environment-only", read(".env.example").includes("PERSONACHAT_ADMIN_USER_IDS")],
  ["phase 34 script parses", (() => {
    try { execFileSync(process.execPath, ["--check", path.join(root, "scripts/check-phase34.mjs")], { stdio: "ignore" }); return true; }
    catch { return false; }
  })()],
];

let ok = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? "OK" : "FAIL"} — ${name}`);
  if (pass) ok++;
}
console.log(`Phase 34/35 checks: ${ok}/${checks.length} OK`);
if (ok !== checks.length) process.exit(1);
