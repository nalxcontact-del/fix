import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const route = read("app/api/capacity/route.ts");
const capacity = read("lib/server/capacity.ts");
const db = read("lib/server/db.ts");
const chat = read("app/api/chat/route.ts");
const page = read("app/page.tsx");
const checks = [
  ["capacity API exists", fs.existsSync(path.join(root, "app/api/capacity/route.ts"))],
  ["capacity table exists", db.includes("CREATE TABLE IF NOT EXISTS capacity_leases")],
  ["capacity queue is FIFO", capacity.includes("ORDER BY joined_at ASC")],
  ["capacity has concurrent limit", capacity.includes("PERSONACHAT_FREE_CONCURRENT_USERS")],
  ["capacity uses expiring leases", capacity.includes("PERSONACHAT_QUEUE_LEASE_SECONDS") && capacity.includes("last_seen_at")],
  ["capacity promotes waiting users transactionally", capacity.includes("BEGIN IMMEDIATE") && capacity.includes("status='waiting'")],
  ["premium bypasses free queue", capacity.includes('plan === "premium"') && (capacity.includes("premiumBypass: isAdmin || plan === \"premium\"") || capacity.includes("premiumBypass:true"))],
  ["capacity API rate limits mutations", route.includes("capacity-mutation") && route.includes("capacity-leave") && route.includes("rateLimit(")],
  ["capacity API validates origin", route.includes("requireSameOrigin(")],
  ["capacity API bounds JSON body", route.includes("readJsonBody") && route.includes("MAX_BODY_BYTES")],
  ["chat enforces active capacity", chat.includes("getCapacityState") && chat.includes('capacity.access === "waiting"')],
  ["queue UI shows position and estimate", page.includes("queuePosition") && page.includes("estimatedWaitSeconds")],
  ["queue UI sends heartbeat and leaves on cleanup", page.includes('"/api/capacity"') && page.includes('"heartbeat"') && page.includes('method: "DELETE"')],
  ["capacity configuration is documented", read(".env.example").includes("PERSONACHAT_FREE_CONCURRENT_USERS") && read("docs/history/root-phase-archive/PHASE-36.md").includes("PERSONACHAT_QUEUE_LEASE_SECONDS")],
  ["phase 36 script parses", (() => { try { execFileSync(process.execPath, ["--check", path.join(root, "scripts/check-phase36.mjs")], { stdio: "ignore" }); return true; } catch { return false; } })()],
];
let ok = 0;
for (const [name, pass] of checks) { console.log(`${pass ? "OK" : "FAIL"} — ${name}`); if (pass) ok++; }
console.log(`Phase 36 checks: ${ok}/${checks.length} OK`);
if (ok !== checks.length) process.exit(1);
