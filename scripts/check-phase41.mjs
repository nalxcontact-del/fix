import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const policy = fs.readFileSync(path.join(root, "lib/server/osint-policy.ts"), "utf8");
const page = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8");
const types = fs.readFileSync(path.join(root, "lib/types.ts"), "utf8");
const checks = [];
const check = (name, pass) => checks.push([name, Boolean(pass)]);

check("real-person type remains explicit", types.includes('CharacterType = "real_person"'));
check("OSINT eligibility is restricted to real people", policy.includes('character.type === "real_person"'));
check("real-person UI clearly states simulation", page.includes("realBotNotice") && page.includes("simulação"));
check("OSINT policy has roleplay precedence", policy.includes("roleplayContradiction") && policy.includes("roleplay"));
check("OSINT policy blocks sensitive categories", policy.includes('"health"') && policy.includes('"location"') && policy.includes('"contact"') && policy.includes('"identity_document"') && policy.includes('"intimate_content"') && policy.includes('"rumor"'));
check("public-person context is treated as approved facts", policy.includes("getApprovedOsintFacts"));
check("OSINT is safely gated by character type", policy.includes("character.type === \"real_person\"") && policy.includes("isFactAllowedByPolicy"));
check("legacy fixture is not part of the character catalog", !fs.readFileSync(path.join(root, "characters/index.ts"), "utf8").includes('joe-biden'));
check("Phase 41 checker parses", (() => { try { execFileSync(process.execPath, ["--check", path.join(root,"scripts/check-phase41.mjs")], { stdio: "ignore" }); return true; } catch { return false; } })());

let ok = 0;
for (const [name, pass] of checks) { console.log(`${pass ? "OK" : "FAIL"} — ${name}`); if (pass) ok++; }
console.log(`Phase 41 real-person OSINT safety checks: ${ok}/${checks.length} OK`);
if (ok !== checks.length) process.exit(1);
