import { readFileSync, existsSync } from "node:fs";
const root = process.cwd();
const checks = [
  ["capacity migration exists", existsSync(`${root}/supabase/migrations/008_personachat_beta_capacity.sql`)],
  ["capacity defaults to 5", /DEFAULT_CAPACITY = 5/.test(readFileSync(`${root}/lib/server/capacity.ts`,"utf8"))],
  ["capacity uses Postgres in control mode", /PERSONACHAT_POSTGRES_CONTROL/.test(readFileSync(`${root}/lib/server/capacity.ts`,"utf8"))],
  ["capacity route awaits durable state", /await getCapacityState/.test(readFileSync(`${root}/app/api/capacity/route.ts`,"utf8"))],
  ["chat checks capacity asynchronously", /await getCapacityState/.test(readFileSync(`${root}/app/api/chat/route.ts`,"utf8"))],
  ["admin capacity API exists", existsSync(`${root}/app/api/admin/capacity/route.ts`)],
  ["admin capacity is audited", /capacity_limit_changed/.test(readFileSync(`${root}/app/api/admin/capacity/route.ts`,"utf8"))],
  ["admin capacity tab exists", /Capacidade/.test(readFileSync(`${root}/app/admin/page.tsx`,"utf8"))],
  ["queue screen exists", /CapacityQueueScreen/.test(readFileSync(`${root}/app/page.tsx`,"utf8"))],
  ["queue error code exists", /CAPACITY_QUEUE/.test(readFileSync(`${root}/app/api/chat/route.ts`,"utf8"))],
];
let ok=0;
for (const [label, pass] of checks) { console.log(`${pass ? "PASS":"FAIL"} — ${label}`); if(pass) ok++; }
if(ok!==checks.length) process.exit(1);
console.log(`Beta capacity checks: ${ok}/${checks.length} OK`);
