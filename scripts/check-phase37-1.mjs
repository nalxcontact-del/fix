import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const check = (name, pass) => checks.push([name, !!pass]);

const page = read("app/page.tsx");
const types = read("lib/types.ts");
const profile = read("app/api/profile/route.ts");
const chat = read("app/api/chat/route.ts");
const db = read("lib/server/db.ts");
const css = read("app/globals.css");

check("response feedback supports positive/negative tags", page.includes("RESPONSE_FEEDBACK_OPTIONS") && page.includes("out_of_character") && page.includes("natural"));
check("response feedback has an explicit other reason", page.includes('"other", "Tell us more"') || page.includes('"other", "Other reason"') && page.includes("responseFeedbackNote"));
check("response feedback is persisted on messages", types.includes("feedbackTags?: string[]") && types.includes("feedbackNote?: string"));
check("response feedback is bounded server-side", profile.includes("slice(0, 6)") && profile.includes("slice(0, 600)"));
check("response feedback is stored in SQLite", db.includes('ensureColumn("response_feedback", "tags_json"') && db.includes('ensureColumn("response_feedback", "note"'));
check("response feedback influences generation", chat.includes("buildResponseFeedbackContext") && chat.includes("body.responseFeedback"));
check("regeneration counter is intentionally removed", !page.includes("regenerate-count") && !page.includes("hourLimit - usageStatus.regeneration.hourRemaining"));
check("profile menu closes when clicking elsewhere", page.includes("profileWrapRef") && page.includes("document.addEventListener(\"mousedown\""));
check("profile menu has dedicated polished styles", css.includes(".profile-menu:before") && css.includes(".profile-menu button:hover"));
check("response feedback UI has dedicated styles", css.includes(".response-feedback-modal") && css.includes(".response-feedback-options"));

let ok = 0;
for (const [name, pass] of checks) { console.log(`${pass ? "OK" : "FAIL"} — ${name}`); if (pass) ok++; }
console.log(`Phase 37.1 response-feedback checks: ${ok}/${checks.length} OK`);
if (ok !== checks.length) process.exit(1);
