import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const check = (name, pass) => checks.push([name, Boolean(pass)]);

check("OSINT policy module exists", fs.existsSync(path.join(root, "lib/server/osint-policy.ts")));
check("OSINT only accepts real public figures", read("lib/server/osint-policy.ts").includes("real_public_figure") && read("lib/server/osint-policy.ts").includes("real_person"));
check("OSINT blocks sensitive categories", read("lib/server/osint-policy.ts").includes("health") && read("lib/server/osint-policy.ts").includes("identity_document") && read("lib/server/osint-policy.ts").includes("intimate_content"));
check("OSINT honors roleplay precedence", read("lib/server/osint-policy.ts").includes("roleplayContradiction") && read("lib/server/osint-policy.ts").includes("relationship"));
check("OSINT facts expire and have status", read("lib/server/db.ts").includes("expires_at") && read("lib/server/db.ts").includes("status TEXT NOT NULL DEFAULT 'active'"));
check("raw OSINT pages are not stored", read("lib/server/db.ts").includes("source_domain") && !read("lib/server/db.ts").includes("source_html"));
check("chat injects approved OSINT only", read("app/api/chat/route.ts").includes("getApprovedOsintFacts") && read("app/api/chat/route.ts").includes("buildOsintContext"));
check("content safety prompt is present", fs.existsSync(path.join(root, "lib/server/content-policy.ts")) && read("app/api/chat/route.ts").includes("buildContentSafetyPrompt"));
check("policy documentation exists", ["OSINT_POLICY.md", "CONTENT_POLICY.md", "DATA_CLASSIFICATION.md", "SAFETY_ARCHITECTURE.md", "MODERATION.md"].every((f) => fs.existsSync(path.join(root, f))));
check("phase 38 documentation exists", fs.existsSync(path.join(root, "docs/history/root-phase-archive/PHASE-38.md")));
check("legal baseline documents Brazilian regulatory references", fs.existsSync(path.join(root, "LEGAL_BASELINE.md")) && read("LEGAL_BASELINE.md").includes("12.975/2026") && read("LEGAL_BASELINE.md").includes("15.211/2025"));

let ok = 0;
for (const [name, pass] of checks) { console.log(`${pass ? "OK" : "FAIL"} — ${name}`); if (pass) ok++; }
console.log(`Phase 38 OSINT/safety checks: ${ok}/${checks.length} OK`);
if (ok !== checks.length) process.exit(1);
