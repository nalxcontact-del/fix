import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const checks = [];
const check = (name, pass) => { checks.push([name, !!pass]); };
const admin = read("app/api/admin/route.ts");
const db = read("lib/server/db.ts");
const session = read("lib/server/session.ts");
const community = read("app/api/community/route.ts");
const page = read("app/admin/page.tsx");

check("admin API exists", fs.existsSync(path.join(root, "app/api/admin/route.ts")));
check("admin API is protected", admin.includes("isConfiguredAdmin") && admin.includes("requireAdmin"));
check("admin mutations have rate limiting", admin.includes('rateLimit(req, "admin-write"') && admin.includes('rateLimit(req, "admin-read"'));
check("admin mutations validate origin", admin.includes("requireSameOrigin(req)") && admin.includes("readJsonBody"));
check("admin dashboard exists", fs.existsSync(path.join(root, "app/admin/page.tsx")) && page.includes("PersonaChat Admin"));
check("admin overview aggregates users bots reports AI", admin.includes("users:") && admin.includes("bots:") && admin.includes("reports:") && admin.includes("ai:"));
check("provider usage is separated", admin.includes("GROUP BY provider") && admin.includes("estimated_cost_usd"));
check("user blocking exists", db.includes("blocked_at") && admin.includes("block_user") && admin.includes("unblock_user") && session.includes("row.blockedAt"));
check("blocked users are removed from public community", community.includes("u.blocked_at IS NULL"));
check("bot moderation exists", admin.includes("unpublish_bot") && admin.includes("publish_bot") && page.includes("Despublicar"));
check("report review actions exist", page.includes('reportAction') && page.includes('"/api/reports"') && page.includes('"reviewing"'));
check("admin audit trail exists", db.includes("admin_audit_log") && admin.includes("audit("));
check("database backup exists", admin.includes("backup") && admin.includes("copyFileSync") && db.includes("getDatabaseFilePath"));
check("backup is admin-only", admin.includes('if (action === "backup")') && admin.includes("requireAdmin()"));
check("moderation docs exist", fs.existsSync(path.join(root, "MODERATION.md")) && read("MODERATION.md").includes("trilha de auditoria"));

let ok=0;
for (const [name, pass] of checks) { console.log(`${pass ? "OK" : "FAIL"} — ${name}`); if (pass) ok++; }
console.log(`Phase 45 admin/moderation checks: ${ok}/${checks.length} OK`);
if (ok !== checks.length) process.exit(1);
