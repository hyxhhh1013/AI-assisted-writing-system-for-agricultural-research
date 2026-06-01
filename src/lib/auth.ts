import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { NextRequest } from "next/server";

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET 环境变量未配置");
  return new TextEncoder().encode(secret);
};

const TOKEN_COOKIE = "token";
const TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7 天
export const USER_ID_HEADER = "x-user-id";

/** 复制 request headers 并注入 proxy 解析出的用户 ID（供 Route Handler 读取） */
export function forwardRequestHeadersWithUserId(
  incoming: Headers,
  userId: string | null,
): Headers {
  const headers = new Headers(incoming);
  if (userId) {
    headers.set(USER_ID_HEADER, userId);
  }
  return headers;
}

// ---- JWT ----

export async function signToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${TOKEN_MAX_AGE}s`)
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return (payload.sub as string) || null;
  } catch {
    return null;
  }
}

// ---- Password ----

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ---- Cookie helpers ----

function getSecureFlag(): string {
  // Nginx 对外提供 HTTPS，但 Next.js 内部是 HTTP，Secure 标志会导致
  // 浏览器在 HTTP 连接上不发送 cookie，造成"登录后显示未登录"
  // secure 性由 Nginx SSL 层保证，Next.js 层不设 Secure
  return '';
}

export function createTokenCookie(token: string): string {
  return `${TOKEN_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TOKEN_MAX_AGE}${getSecureFlag()}`;
}

export function clearTokenCookie(): string {
  return `${TOKEN_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${getSecureFlag()}`;
}

// ---- User helpers ----

/**
 * 获取当前登录用户（在 API Route 中调用）
 * 依赖 src/proxy.ts 注入的 request header（x-user-id）
 */
export async function getCurrentUser(req: NextRequest) {
  const userId = req.headers.get(USER_ID_HEADER);
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  return user;
}
