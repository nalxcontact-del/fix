import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const layout = read("app/layout.tsx");
const page = read("app/page.tsx");

const checks = [
  ["root HTML defaults to English", /<html\s+lang="en"/.test(layout)],
  ["browser translation is disabled by default", /translate="no"/.test(layout)],
  ["Google notranslate metadata is present", /google:\s*"notranslate"/.test(layout)],
  ["hydration warning is scoped to root HTML", /suppressHydrationWarning/.test(layout)],
  ["metadata is English", /description:\s*"Roleplay and character conversations with AI\."/i.test(layout)],
  ["language updates HTML after selection", /document\.documentElement\.lang\s*=/.test(page)],
  ["chat sends selected app language", /body:\s*JSON\.stringify\(\{[^}]*\blanguage,/.test(page)],
  ["profile does not expose conversations tab", !page.includes('profile-conversations-tab') && !page.includes('profileTab==="conversations"')],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (ok) console.log(`PASS ${name}`);
  else { console.error(`FAIL ${name}`); failed++; }
}
console.log(`Phase 52 hydration/language checks: ${checks.length - failed}/${checks.length}`);
process.exitCode = failed ? 1 : 0;
