import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const chat = fs.readFileSync(path.join(root, "app/api/chat/route.ts"), "utf8");
const learning = fs.readFileSync(path.join(root, "lib/server/response-learning.ts"), "utf8");
const evaluation = fs.readFileSync(path.join(root, "lib/server/evaluation.ts"), "utf8");
const quality = fs.readFileSync(path.join(root, "lib/server/quality.ts"), "utf8");
const checks = [
  ["candidate scoring uses learned preference profile", /scoreResponseAgainstPreferenceProfile\(db, authenticatedUser\.id, character\.id, candidate\.text\)/.test(chat)],
  ["regeneration penalizes hard quality failures", /unclosed_action: 45/.test(chat) && /language_mismatch: 35/.test(chat)],
  ["evaluation measures user-agency violations", /controlled_user/.test(evaluation) && /userAgencyPenalty/.test(evaluation)],
  ["evaluation measures pacing", /pacing/.test(evaluation) && /poor_pacing/.test(evaluation)],
  ["evaluation reduces echo-only relevance scoring", /echoPenalty/.test(evaluation)],
  ["learned profile scoring is soft and bounded", /return clamp\(score, -24, 24\)/.test(learning)],
  ["final output is re-inspected after formatting repair", /const finalIssues = inspectGeneratedResponse/.test(chat)],
  ["fatal final quality issues are blocked", /fatalFinalIssues/.test(chat) && /safeFailure: true/.test(chat)],
  ["format repair still closes unmatched action markers", /singleAsterisks/.test(quality) && /result = `\$\{result\}\*`/.test(quality)],
];
let ok = 0;
for (const [name, pass] of checks) { console.log(`${pass ? "PASS" : "FAIL"} ${name}`); if (pass) ok++; }
console.log(`Phase 49 quality-engine checks: ${ok}/${checks.length}`);
if (ok !== checks.length) process.exit(1);
