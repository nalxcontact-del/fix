import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const page = read("app/page.tsx");
const community = read("app/api/community/route.ts");
const profile = read("app/api/profile/route.ts");

const checks = [
  ["creator search mode exists", /searchMode.*"characters".*"creators"/s.test(page)],
  ["creator search calls server endpoint", /\/api\/community\?mode=creators&q=/.test(page)],
  ["creator results open public profile", /creatorSearchResults\.map\(c=>.*openProfile\(c\.id\)/s.test(page)],
  ["creator results expose public bot names", /Character\(s\):.*c\.bots\.map\(b=>b\.name\)/s.test(page)],
  ["creator results aggregate interactions", /Number\(c\.interactions\)/.test(page) && /bots\.reduce\(\(sum, bot\).*interactionByBot/.test(community)],
  ["creator search matches username/name only", /WHERE \(\? = '' OR LOWER\(COALESCE\(u\.username, ''\)\) LIKE \? OR LOWER\(u\.name\) LIKE \?\)/.test(community)],
  ["creator search requires public bots", /JOIN user_bots b ON b\.owner_id=u\.id AND b\.visibility='public'/.test(community)],
  ["private bots excluded from character suggestions", /homeSearchSuggestions.*?filter\(c => c\.visibility !== "private"\)/s.test(page)],
  ["private bots excluded from character results", /homeCharacterResults.*?filter\(c => c\.visibility !== "private"\)/s.test(page)],
  ["public profile query excludes private bots for other viewers", /visibility='public' OR owner_id=\?/.test(profile)],
  ["profile has shareable public route", /\/api\/profile\?id=/.test(page)],
  ["explore categories hook is before auth early returns", page.indexOf("const exploreCategories = useMemo") < page.indexOf("if (!authReady) return")],
  ["creator query supplies exactly three SQL parameters", /\.all\(q \? q : "", term, term\)/.test(community)],
];

let ok = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? "OK" : "FAIL"} — ${name}`);
  if (pass) ok++;
}
console.log(`Phase 44 creator/search checks: ${ok}/${checks.length} OK`);
if (ok !== checks.length) process.exit(1);
