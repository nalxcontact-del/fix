import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const start = read("app/api/auth/google/route.ts");
const callback = read("app/api/auth/google/callback/route.ts");
const db = read("lib/server/db.ts");
const client = read("app/page.tsx");
const env = read(".env.example");
const authClient = read("lib/auth.ts");
const docs = read("GOOGLE-LOGIN.md");
const checks = [
  ["Google auth start route exists", start.includes("export async function GET")],
  ["Google OAuth uses authorization code flow", start.includes('response_type: "code"')],
  ["Google OAuth requests OpenID identity scopes", start.includes('scope: "openid email profile"')],
  ["OAuth state is random and HttpOnly", start.includes('randomBytes(32)') && start.includes("httpOnly: true")],
  ["OAuth state is SameSite protected", start.includes('sameSite: "lax"')],
  ["Google callback validates state", callback.includes("expectedState !== returnedState")],
  ["Google callback exchanges code server-side", callback.includes("oauth2.googleapis.com/token") && callback.includes("client_secret")],
  ["Google profile is fetched server-side", callback.includes("openidconnect.googleapis.com/v1/userinfo")],
  ["Google email must be verified", callback.includes("profile.email_verified") && callback.includes("if (!googleSub || !email || !verified)")],
  ["Google subject is persisted separately", db.includes("google_sub") && db.includes("users_google_sub_unique")],
  ["Google login creates a normal PersonaChat session", callback.includes("await createSession(userId)")],
  ["Google login button is wired in the client", client.includes("loginWithGoogle") && client.includes("google-auth-button")],
  ["Google credentials are server-only in example env", env.includes("GOOGLE_CLIENT_SECRET=") && !env.includes("NEXT_PUBLIC_GOOGLE")],
  ["Google client secret is absent from client code", !client.includes("GOOGLE_CLIENT_SECRET") && !client.includes("GOOGLE_CLIENT_ID")],
  ["Google setup documentation exists", docs.includes("Google Cloud") && docs.includes("redirect URI")],
  ["Client helper uses local auth endpoint", authClient.includes('/api/auth/google')],
];
let ok = 0;
for (const [name, pass] of checks) { console.log(`${pass ? "PASS" : "FAIL"} ${name}`); if (pass) ok++; }
console.log(`Google auth checks: ${ok}/${checks.length}`);
if (ok !== checks.length) process.exit(1);
