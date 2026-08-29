import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const checks = [
  ["Next.js >= 16.2.11 (security floor)", (() => {
    try {
      const pkg = JSON.parse(read("package.json"));
      const parts = String(pkg.dependencies?.next || "").replace(/^[^0-9]*/, "").split(".").map(Number);
      return parts.length >= 3 && parts.every(Number.isFinite) && (parts[0] > 16 || (parts[0] === 16 && (parts[1] > 2 || (parts[1] === 2 && parts[2] >= 11))));
    } catch { return false; }
  })()],
  ["package manager metadata is valid", (() => { try { const pkg=JSON.parse(read("package.json")); return pkg.packageManager === undefined || typeof pkg.packageManager === "string"; } catch { return false; } })()],
  ["API key is documented only as an env variable", read(".env.example").includes("GEMINI_API_KEY=") && !/GEMINI_API_KEY=\S+/.test(read(".env.example"))],
  [".env files ignored", /(^|\n)\.env\*/.test(read(".gitignore"))],
  ["chat reads API key server-side", read("app/api/chat/route.ts").includes("process.env.GEMINI_API_KEY")],
  ["chat does not contain a hard-coded key", !/gsk_[A-Za-z0-9_-]{20,}/.test(read("app/api/chat/route.ts"))],
  ["security helper checks actual body bytes", read("lib/server/security.ts").includes("await req.arrayBuffer()")],
  ["security helper rejects oversized bodies", read("lib/server/security.ts").includes('BODY_TOO_LARGE')],
  ["production origin validation exists", read("lib/server/security.ts").includes("requireSameOrigin") && read("lib/server/security.ts").includes("process.env.NODE_ENV !== \"production\"")],
  ["password hashing uses scrypt", read("lib/server/security.ts").includes("scryptSync")],
  ["session cookie is HttpOnly", read("lib/server/session.ts").includes("httpOnly: true")],
  ["session cookie is Secure in production", read("lib/server/session.ts").includes("secure: process.env.NODE_ENV === \"production\"")],
  ["security headers include frame protection", read("next.config.ts").includes('X-Frame-Options') && read("next.config.ts").includes('DENY')],
  ["security headers include HSTS in production", read("next.config.ts").includes("Strict-Transport-Security")],
  ["chat has rate limiting", read("app/api/chat/route.ts").includes('rateLimit(request, "chat"')],
  ["auth login has rate limiting", read("app/api/auth/login/route.ts").includes('rateLimit(req, "auth-login"')],
  ["auth register has rate limiting", read("app/api/auth/register/route.ts").includes('rateLimit(req, "auth-register"')],
  ["chat uses bounded JSON reader", read("app/api/chat/route.ts").includes("readJsonBody<") && read("app/api/chat/route.ts").includes("1_500_000")],
  ["app-data uses bounded JSON reader", read("app/api/app-data/route.ts").includes("readJsonBody<") && read("app/api/app-data/route.ts").includes("8 * 1024 * 1024")],
];

let ok = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? "OK" : "FAIL"} — ${name}`);
  if (pass) ok++;
}
console.log(`Phase 30 security checks: ${ok}/${checks.length} OK`);
if (ok !== checks.length) process.exit(1);
