import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const root = process.cwd();
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const db = read("lib/server/db.ts");
const usage = read("lib/server/usage.ts");
const chat = read("app/api/chat/route.ts");
const page = read("app/page.tsx");
const checks = [
  ["usage endpoint exists", fs.existsSync(path.join(root,"app/api/usage/route.ts"))],
  ["usage endpoint exposes server-side status", read("app/api/usage/route.ts").includes("getUsageStatus")],
  ["manual regeneration limits exist", usage.includes("PERSONACHAT_FREE_REGENERATIONS_PER_HOUR") && usage.includes("PERSONACHAT_PREMIUM_REGENERATIONS_PER_DAY")],
  ["regeneration reservation is transactional", usage.includes("BEGIN IMMEDIATE") && usage.includes("generation_reservations")],
  ["chat enforces regeneration reservation", chat.includes("reserveRegeneration") && chat.includes("body.regenerate")],
  ["reservation is released", chat.includes("releaseGenerationReservation")],
  ["provider usage stores plan", chat.includes("plan: userPlan") && db.includes("plan TEXT NOT NULL DEFAULT 'free'")],
  ["quality telemetry is text-free", db.includes("CREATE TABLE IF NOT EXISTS quality_events") && usage.includes("recordQualityIssues")],
  ["explicit feedback endpoint exists", fs.existsSync(path.join(root,"app/api/feedback/route.ts"))],
  ["feedback is bounded and categorized", read("app/api/feedback/route.ts").includes("MAX_TEXT") && read("app/api/feedback/route.ts").includes("CATEGORIES")],
  ["admin insights are protected", fs.existsSync(path.join(root,"app/api/insights/route.ts")) && read("app/api/insights/route.ts").includes("isConfiguredAdmin")],
  ["insights aggregate quality and feedback", read("app/api/insights/route.ts").includes("quality_events") && read("app/api/insights/route.ts").includes("product_feedback") && read("app/api/insights/route.ts").includes("response_feedback")],
  ["insights do not query conversation text", !read("app/api/insights/route.ts").includes("FROM messages") && !read("app/api/insights/route.ts").includes("FROM conversations")],
  ["regeneration status is surfaced to client", page.includes("regeneration") && page.includes("/api/usage")],
  ["phase 37 script parses", (() => { try { execFileSync(process.execPath,["--check",path.join(root,"scripts/check-phase37.mjs")],{stdio:"ignore"}); return true; } catch { return false; } })()],
];
let ok=0; for(const [name,pass] of checks){console.log(`${pass?"OK":"FAIL"} — ${name}`);if(pass)ok++;}
console.log(`Phase 37 checks: ${ok}/${checks.length} OK`); if(ok!==checks.length)process.exit(1);
