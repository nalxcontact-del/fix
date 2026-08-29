export type UserProfile = { id: string; name: string; username: string; email: string; createdAt: number; avatar?: string | null; gender?: "female" | "male" | null; plan?: "free" | "premium"; isAdmin?: boolean };

async function request(path: string, body?: unknown) {
  const res = await fetch(path, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error || "Ocorreu um erro." };
  return data;
}
export async function getSession(): Promise<UserProfile | null> { const data = await request("/api/auth/session"); return data.user ?? null; }
export async function register(name: string, email: string, password: string) { return request("/api/auth/register", { name, email, password }) as Promise<{ user?: UserProfile; error?: string }>; }
export async function login(email: string, password: string) { return request("/api/auth/login", { email, password }) as Promise<{ user?: UserProfile; error?: string }>; }
export async function logout() { await request("/api/auth/logout", {}); }

export function loginWithGoogle() { const anchor = document.createElement("a"); anchor.href = "/api/auth/google"; anchor.rel = "noopener"; document.body.appendChild(anchor); anchor.click(); anchor.remove(); }
