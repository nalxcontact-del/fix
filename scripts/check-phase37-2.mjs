import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const page = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");

const checks = [];
function check(name, pass) { checks.push([name, Boolean(pass)]); }

check("search normalization removes accents", page.includes(".normalize(\"NFD\")") && page.includes("[\\u0300-\\u036f]"));
check("character search prioritizes exact and prefix name matches", page.includes("if (name === q) return 0;") && page.includes("if (name.startsWith(q)) return 1;"));
check("chat sidebar has dedicated search state", page.includes("const [chatSearch, setChatSearch] = useState(\"\")"));
check("chat sidebar search filters conversation characters", page.includes("characterSearchScore(character, query) < 6") && page.includes("sidebarConversations"));
check("chat sidebar search does not call the AI or search API", page.includes("onChange={e=>setChatSearch(e.target.value)}"));
check("discover search uses the same character matcher", page.includes("characterSearchScore(c, query) < 6") && page.includes("visibleCharacters"));
check("community search results use the same matcher and ranking", page.includes("filteredExplore") && page.includes("characterSearchScore(c, query) < 6"));
check("chat sidebar search has clear action and accessible label", page.includes("aria-label=\"Clear search\"") && page.includes("aria-label={t(\"searchYourChats\")}"));
check("chat sidebar has bounded scroll area", css.includes(".chat-sidebar-list{min-height:0;overflow:auto"));
check("phase 37.2 documentation exists", fs.existsSync(path.join(root, "docs/history/root-phase-archive/PHASE-37.2.md")));

let ok = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? "OK" : "FAIL"} — ${name}`);
  if (pass) ok++;
}
console.log(`Phase 37.2 search/navigation checks: ${ok}/${checks.length} OK`);
if (ok !== checks.length) process.exit(1);
