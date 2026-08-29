import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const page = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8");
const usage = fs.readFileSync(path.join(root, "lib/server/usage.ts"), "utf8");
const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
const checks = [];
const check = (name, pass) => checks.push([name, !!pass]);

check("main sidebar exposes chat search", page.includes("sidebar-chat-search") && page.includes("searchYourChats"));
check("main sidebar search uses conversation filtering", page.includes("sidebarConversations.map") && !page.includes("sidebarConversations.slice(0,8)"));
check("premium comparison has contextual public-figure copy", page.includes("Live public context for real-person characters"));
check("premium OSINT copy does not claim live provider access", page.includes("research trustworthy public sources"));
check("regeneration counter is removed from action", !page.includes("regenerate-count") || css.includes("display:none"));
check("regeneration button is not disabled by a quota", !/regenerate-action[^>]*disabled=\{[^}]*usageStatus/.test(page));
check("regeneration quota is configurable and finite", usage.includes("PERSONACHAT_FREE_REGENERATIONS_PER_HOUR") && usage.includes("PERSONACHAT_FREE_REGENERATIONS_PER_DAY") && usage.includes("PERSONACHAT_PREMIUM_REGENERATIONS_PER_HOUR"));
check("token/cost budget remains separate", usage.includes("checkGenerationBudget") && usage.includes("PERSONACHAT_GLOBAL_DAILY_USD"));
check("transactional reservation remains a concurrency guard", usage.includes("BEGIN IMMEDIATE") && usage.includes("generation_reservations"));
check("phase 39.1 script parses", (() => { try { execFileSync(process.execPath, ["--check", path.join(root,"scripts/check-phase39-1.mjs")], {stdio:"ignore"}); return true; } catch { return false; } })());

let ok=0;
for (const [name,pass] of checks) { console.log(`${pass ? "OK" : "FAIL"} — ${name}`); if(pass) ok++; }
console.log(`Phase 39.1 refinements checks: ${ok}/${checks.length} OK`);
if(ok !== checks.length) process.exit(1);
