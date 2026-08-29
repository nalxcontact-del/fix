import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const policy = read("lib/server/osint-policy.ts");
const tavily = read("lib/server/osint-tavily.ts");
const chat = read("app/api/chat/route.ts");
const db = read("lib/server/db.ts");
const env = read(".env.example");
const checks = [];
const check = (name, pass) => checks.push([name, Boolean(pass)]);

check("Tavily adapter exists", fs.existsSync(path.join(root, "lib/server/osint-tavily.ts")));
check("Tavily uses server environment key", tavily.includes("process.env.TAVILY_API_KEY") && !tavily.includes("NEXT_PUBLIC_TAVILY_API_KEY"));
check("Tavily endpoint is server-side", tavily.includes("https://api.tavily.com/search") && chat.includes("ensureOsintForChat"));
check("Basic search is used by default", tavily.includes('search_depth: osintPlan.deep ? "advanced" : "basic"') && tavily.includes("osintPlan.deep") && tavily.includes("include_raw_content: false"));
check("Raw pages are not persisted", !db.includes("source_html") && tavily.includes("include_raw_content: false"));
check("Only approved public source domains are stored", tavily.includes("HIGH_RELIABILITY") && tavily.includes("MEDIUM_RELIABILITY") && tavily.includes('reliability === "low"'));
check("Sensitive OSINT content is rejected", tavily.includes("BLOCKED_TEXT") && policy.includes('"health"') && policy.includes('"identity_document"'));
check("OSINT remains roleplay subordinate", policy.includes("roleplayContradiction") && tavily.includes("selectOsintFactsForRoleplay"));
check("OSINT cache has expiry/status and refresh log", db.includes("osint_facts") && db.includes("expires_at") && db.includes("osint_refresh_log"));
check("Refresh is lazy and cached", tavily.includes("ensureOsintForChat") && tavily.includes("asksForFreshPublicInfo") && tavily.includes("CACHE_SUFFICIENT"));
check("Refresh has a server-side daily development cap", tavily.includes("TAVILY_DEV_DAILY_CREDITS") && tavily.includes("claimRefresh"));
check("Refresh has per-subject cooldown", tavily.includes("SUBJECT_COOLDOWN_MS") && tavily.includes("last_attempt_at"));
check("Refresh is transactional against duplicate concurrent calls", tavily.includes("BEGIN IMMEDIATE") && tavily.includes("ON CONFLICT(subject_id)"));
check("Production refresh is Premium-only", !tavily.includes('process.env.NODE_ENV === "production" && normalizedPlan !== "premium"') && tavily.includes("if (normalizedPlan !== \"premium\") return"));
check("Chat injects approved facts only", chat.includes("ensureOsintForChat") && chat.includes("buildOsintContext"));
check("Tavily key is documented but empty in env example", env.includes("TAVILY_API_KEY=") && !/TAVILY_API_KEY=\S+/.test(env));
check("Phase 40 checker parses", (() => { try { execFileSync(process.execPath, ["--check", path.join(root, "scripts/check-phase40.mjs")], { stdio: "ignore" }); return true; } catch { return false; } })());

let ok = 0;
for (const [name, pass] of checks) { console.log(`${pass ? "OK" : "FAIL"} — ${name}`); if (pass) ok++; }
console.log(`Phase 40 OSINT/Tavily checks: ${ok}/${checks.length} OK`);
if (ok !== checks.length) process.exit(1);
