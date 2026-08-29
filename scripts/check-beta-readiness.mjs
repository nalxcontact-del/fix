import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const checks = [];
const check = (name, pass) => checks.push([name, !!pass]);

check("chat has recoverable retry UI", read("app/page.tsx").includes("chat-error-banner") && read("app/page.tsx").includes("Try again"));
check("chat failure does not persist fake error messages", !read("app/page.tsx").includes("Não consegui gerar uma resposta agora."));
check("chat emits request IDs on provider failures", read("app/api/chat/route.ts").includes("requestId") && read("app/api/chat/route.ts").includes("provider_error"));
check("community discovery uses normalized message metadata", read("app/api/community/route.ts").includes("JOIN messages m") && !read("app/api/community/route.ts").includes("SELECT conversations_json FROM app_data"));
check("community exposes character-type categories", read("app/api/community/route.ts").includes("real_person") && read("app/api/community/route.ts").includes("existing_character") && read("app/api/community/route.ts").includes("original"));
check("community UI renders type categories", read("app/page.tsx").includes("Existing characters") && read("app/page.tsx").includes("Original characters"));
check("usage is visible in chat", read("app/page.tsx").includes("todayUsage") && read("app/page.tsx").includes("tokens"));
check("beta onboarding exists", read("app/page.tsx").includes("personachat-beta-welcome-v1"));
check("sensitive API responses are no-store", ["app/api/app-data/route.ts","app/api/profile/route.ts","app/api/auth/session/route.ts"].every(f => read(f).includes("Cache-Control") && read(f).includes("no-store")));
check("stale frontend backup removed", !fs.existsSync(path.join(root, "app/page.tsx.bak")));
check("security audit exists", fs.existsSync(path.join(root, "docs/BETA-SECURITY-AUDIT.md")));
check("historical docs are organized", fs.existsSync(path.join(root, "docs/history")));

let ok = 0;
for (const [name, pass] of checks) { console.log(`${pass ? "OK" : "FAIL"} — ${name}`); if (pass) ok++; }
console.log(`Beta readiness checks: ${ok}/${checks.length} OK`);
if (ok !== checks.length) process.exit(1);
