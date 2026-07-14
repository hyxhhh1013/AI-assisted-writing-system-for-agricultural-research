/**
 * Direction 资源归属校验 — SEC-01
 * 所有 /api/directions/* 路由在读写前须通过 owner 作用域。
 */

import type { Direction } from "@prisma/client";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth";
import { notFoundResponse, unauthorizedResponse } from "@/lib/api-response";

export type DirectionAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/** 从 proxy 注入的 header 读取 userId；未登录返回 401 Response */
export function requireDirectionUser(req: NextRequest): DirectionAuthResult {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return { ok: false, response: unauthorizedResponse() };
  }
  return { ok: true, userId };
}

/** 按 slug + userId 查找方向；非 owner 与不存在均返回 null（对外统一 404） */
export async function getOwnedDirection(
  slug: string,
  userId: string,
): Promise<Direction | null> {
  return prisma.direction.findFirst({
    where: { slug, userId },
  });
}

/** 组合：鉴权 + 归属；失败时返回可直接 return 的 Response */
export async function requireOwnedDirection(
  req: NextRequest,
  slug: string,
): Promise<
  | { ok: true; userId: string; direction: Direction }
  | { ok: false; response: NextResponse }
> {
  const auth = requireDirectionUser(req);
  if (!auth.ok) return auth;

  const direction = await getOwnedDirection(slug, auth.userId);
  if (!direction) {
    return { ok: false, response: notFoundResponse("方向不存在") };
  }

  return { ok: true, userId: auth.userId, direction };
}
