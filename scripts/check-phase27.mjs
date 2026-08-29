import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  ["lib/server/evaluation.ts", "avaliador determinístico"],
  ["lib/server/quality.ts", "controle de qualidade"],
  ["lib/server/db.ts", "eventos de geração"],
  ["app/api/chat/route.ts", "pipeline de geração"],
  ["docs/history/root-phase-archive/PHASE-27.md", "documentação da fase"],
];

let ok = 0;
for (const [file, label] of required) {
  const exists = fs.existsSync(path.join(root, file));
  console.log(`${exists ? "OK" : "FAIL"} ${label}: ${file}`);
  if (exists) ok += Number(exists);
}

const evaluation = fs.readFileSync(path.join(root, "lib/server/evaluation.ts"), "utf8");
for (const term of ["relevance", "specificity", "naturalness", "continuity", "persona", "repetition"]) {
  const present = evaluation.includes(`"${term}"`);
  console.log(`${present ? "OK" : "FAIL"} dimensão de avaliação: ${term}`);
  if (present) ok += 1;
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const hasScript = typeof pkg.scripts?.["check:phase27"] === "string";
console.log(`${hasScript ? "OK" : "FAIL"} script check:phase27`);
if (hasScript) ok += 1;

console.log(`Phase 27 structural checks: ${ok} OK`);
if (ok < required.length + 7) process.exit(1);
