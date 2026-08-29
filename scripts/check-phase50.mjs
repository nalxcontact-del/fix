import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
const page = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8");
const checks = [
  ["feedback modals are viewport contained", /\.feedback-modal,\s*\.response-feedback-modal\{[\s\S]*?max-height:calc\(100dvh - 16px\)!important/.test(css)],
  ["response feedback uses compact grid on desktop", /\.response-feedback-options\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/.test(css)],
  ["response feedback stays two columns on phones", /@media \(max-width:700px\)[\s\S]*?\.response-feedback-options\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(css)],
  ["feedback textareas have bounded height", /\.feedback-modal \.form-label textarea,\s*\.response-feedback-modal \.form-label textarea\{[\s\S]*?max-height:28dvh/.test(css)],
  ["modal controls cannot force horizontal overflow", /\.overlay button,\s*\.overlay select,\s*\.overlay input,\s*\.overlay textarea\{[\s\S]*?min-width:0/.test(css)],
  ["product feedback closes after successful submit", /setTimeout\(\(\)=>\{setFeedbackOpen\(false\)/.test(page)],
  ["response feedback closes after successful submit", /setTimeout\(\(\)=>\{setResponseFeedbackOpen\(false\)/.test(page)],
];
let ok=0;
for (const [name, pass] of checks) { console.log(`${pass ? "PASS" : "FAIL"} ${name}`); if(pass) ok++; }
console.log(`Phase 50 UI checks: ${ok}/${checks.length}`);
if(ok!==checks.length) process.exit(1);
