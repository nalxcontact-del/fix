import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [
  ["architecture guide exists", fs.existsSync(path.join(root, "ARCHITECTURE.md"))],
  ["project state identifies architecture guide", read("PROJECT_STATE.md").includes("ARCHITECTURE.md")],
  ["project state uses package Next.js version", (() => { try { const pkg=JSON.parse(read("package.json")); return read("PROJECT_STATE.md").includes(String(pkg.dependencies?.next ?? "")); } catch { return false; } })()],
  ["readme documents dev command", read("README.md").includes("npm run dev")],
  ["readme documents production command", read("README.md").includes("npm run start")],
  ["readme warns against publishing API key", read("README.md").includes("NEXT_PUBLIC_")],
  ["architecture documents server-only LLM boundary", read("ARCHITECTURE.md").includes("exclusivamente no servidor")],
  ["architecture documents normalized database", read("ARCHITECTURE.md").includes("conversations") && read("ARCHITECTURE.md").includes("generation_events")],
  ["architecture documents migration safety", read("ARCHITECTURE.md").includes("Nunca apagar o banco")],
  ["architecture documents baseline commands", read("ARCHITECTURE.md").includes("npm run test:all") && read("ARCHITECTURE.md").includes("npm audit")],
  ["phase 33 script parses", (() => { try { execFileSync(process.execPath, ["--check", path.join(root, "scripts/check-phase33.mjs")], { stdio: "ignore" }); return true; } catch { return false; } })()],
];
let ok = 0;
for (const [name, pass] of checks) { console.log(`${pass ? "OK" : "FAIL"} — ${name}`); if (pass) ok++; }
console.log(`Phase 33 architecture/documentation checks: ${ok}/${checks.length} OK`);
if (ok !== checks.length) process.exit(1);
