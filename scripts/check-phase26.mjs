import fs from "node:fs";
import path from "node:path";

const required = [
  "app/api/chat/route.ts",
  "app/api/profile/route.ts",
  "lib/server/db.ts",
  "lib/server/quality.ts",
  "lib/memory.ts",
  "lib/relationship.ts",
  "app/page.tsx",
];
const failures = [];
for (const file of required) {
  if (!fs.existsSync(path.resolve(file))) failures.push(`Arquivo ausente: ${file}`);
}
const chat = fs.readFileSync("app/api/chat/route.ts", "utf8");
const page = fs.readFileSync("app/page.tsx", "utf8");
const db = fs.readFileSync("lib/server/db.ts", "utf8");
const checks = [
  ["qualidade de resposta", chat.includes("inspectGeneratedResponse")],
  ["limite de histórico", chat.includes("MAX_HISTORY_MESSAGES")],
  ["limite de memórias", chat.includes("MAX_MEMORY_ITEMS")],
  ["eventos de regeneração", db.includes("generation_events")],
  ["limites visíveis na criação", page.includes("CHARACTER_LIMITS") && page.includes("CharacterCount")],
  ["botão PersonaChat +", page.includes("PersonaChat +")],
  ["feedback", page.includes("feedback(m.id")],
];
for (const [label, ok] of checks) if (!ok) failures.push(`Check falhou: ${label}`);
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`Phase 26 checks: ${checks.length} OK`);
