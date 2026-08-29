import fs from "node:fs";

const checks = [
  ["scene signal extraction", fs.readFileSync("app/api/chat/route.ts", "utf8").includes("extractRoleplaySignals")],
  ["scene state context", fs.readFileSync("app/api/chat/route.ts", "utf8").includes("buildSceneState")],
  ["response architecture", fs.readFileSync("app/api/chat/route.ts", "utf8").includes("Resposta curta é válida")],
  ["user agency guard", fs.readFileSync("app/api/chat/route.ts", "utf8").includes("Nunca narre pensamentos, emoções, falas ou decisões do usuário")],
  ["character panel", fs.readFileSync("app/page.tsx", "utf8").includes("character-panel")],
  ["character profile", fs.readFileSync("app/page.tsx", "utf8").includes("characterProfileOpen")],
  ["creator id", fs.readFileSync("lib/types.ts", "utf8").includes("creatorId?: string") && fs.readFileSync("app/api/profile/route.ts", "utf8").includes("creatorId:user.id")],
  ["character share", fs.readFileSync("app/page.tsx", "utf8").includes("?character=")],
  ["phase css", fs.readFileSync("app/globals.css", "utf8").includes("character-panel-overlay")],
];
let ok = 0;
for (const [name, pass] of checks) { console.log(`${pass ? "OK" : "FAIL"} ${name}`); if (pass) ok++; }
if (ok !== checks.length) process.exit(1);
console.log(`Phase 28 structural checks: ${ok}/${checks.length} OK`);
