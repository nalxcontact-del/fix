import fs from "node:fs";
import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [
  ["conversation relationship table", read("lib/server/db.ts").includes("conversation_relationships")],
  ["OSINT untrusted delimiter", read("lib/server/osint-policy.ts").includes("<untrusted_external_data>")],
  ["quality generic detection", read("lib/server/quality.ts").includes('"generic"')],
  ["quality persona drift detection", read("lib/server/quality.ts").includes('"persona_drift"')],
  ["new roleplay isolation", read("app/page.tsx").includes("A new roleplay is intentionally isolated")],
  ["persona language consistency", read("app/api/chat/route.ts").includes("CONSISTÊNCIA MULTILÍNGUE")],
];
const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (failed.length) process.exit(1);
