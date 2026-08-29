import fs from "node:fs";
const checks = [
 ["Billie removida", !fs.readFileSync("characters/index.ts","utf8").includes('id: "billie-eilish"')],
 ["Anne removida", !fs.readFileSync("characters/index.ts","utf8").includes('id: "anne-hathaway"')],
 ["Plano no banco", fs.readFileSync("lib/server/db.ts","utf8").includes('ensureColumn("users", "plan"')],
 ["Sessão expõe plano", fs.readFileSync("lib/server/session.ts","utf8").includes('plan')],
 ["API Premium", fs.existsSync("app/api/premium/route.ts")],
 ["Módulo Premium", fs.existsSync("lib/premium.ts")],
 ["Modal Premium", fs.readFileSync("app/page.tsx","utf8").includes("PremiumModal")],
 ["Botão Premium abre modal", fs.readFileSync("app/page.tsx","utf8").includes('onClick={()=>setPremiumOpen(true)}')],
];
let ok=0; for (const [name,pass] of checks) { console.log(`${pass?"OK":"FAIL"} — ${name}`); if(pass) ok++; }
if(ok!==checks.length) process.exit(1);
console.log(`Phase 29 check: ${ok}/${checks.length} OK`);
