/** 认证 API 客户端（UI → /api/auth/*） */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role?: string;
}

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
  confirmPassword: string;
}

/** GET /api/auth/me */
export async function getMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me");
  if (!res.ok) return null;
  return res.json() as Promise<AuthUser>;
}

/** POST /api/auth/login */
export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json()) as AuthUser & { error?: string };
  if (!res.ok) throw new Error(data.error || "登录失败");
  return data;
}

/** POST /api/auth/logout */
export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

/** POST /api/auth/register */
export async function register(input: RegisterInput): Promise<void> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "注册失败");
}
