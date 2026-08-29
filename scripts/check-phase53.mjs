import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const page = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8");
const usage = fs.readFileSync(path.join(root, "lib/server/usage.ts"), "utf8");
const chat = fs.readFileSync(path.join(root, "app/api/chat/route.ts"), "utf8");
const insights = fs.readFileSync(path.join(root, "app/api/insights/route.ts"), "utf8");
const env = fs.readFileSync(path.join(root, ".env.example"), "utf8");
const checks = [
  ["daily beta limit is 50k", usage.includes("betaDailyCap = 50_000") && usage.includes('Math.min(envInt("PERSONACHAT_FREE_DAILY_TOKENS", betaDailyCap), betaDailyCap)') && env.includes("PERSONACHAT_FREE_DAILY_TOKENS=50000")],
  ["global beta limit supports five testers", usage.includes("PERSONACHAT_GLOBAL_DAILY_TOKENS") && usage.includes("betaGlobalCap = 250_000") && env.includes("PERSONACHAT_GLOBAL_DAILY_TOKENS=250000")],
  ["chat no longer displays token count", !page.includes("dailyTokens).toLocaleString(\"en-US\")} tokens")],
  ["chat blocks composer at daily limit", page.includes("usageStatus.used.dailyTokens >= usageStatus.limits.dailyTokens")],
  ["server returns usage on budget block", chat.includes("usageLimit: true") && chat.includes("usage: getUsageStatus")],
  ["message sheet has copy", page.includes("Copy") && page.includes("copyMessage")],
  ["message sheet has branch", page.includes("New chat from here") && page.includes("branchConversationFromMessage")],
  ["message sheet has rewind", page.includes("Rewind to here") && page.includes("prepareMessageAction(\"rewind\"")],
  ["message sheet has edit", page.includes("setEditing(target.id)")],
  ["message sheet pins to memory", page.includes("toggleMessagePin") && page.includes('source: "manual"')],
  ["remove cascades later messages", page.includes("action === \"remove\" ? targetIndex : targetIndex + 1")],
  ["branch remaps message and memory ids", page.includes("messageIdMap") && page.includes("conversationId: branchId")],
  ["profile avatar opens from explore", page.includes('aria-label="Open profile"') && page.includes("setProfileOpen(!profileOpen)" )],
  ["admin insights expose tester usage", insights.includes("testers:") && insights.includes("dailyTokens")],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) failed++; }
console.log(`Phase 53 message controls + beta usage checks: ${checks.length - failed}/${checks.length}`);
if (failed) process.exit(1);
