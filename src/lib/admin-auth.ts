import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const USER_ID_HEADER = "x-user-id";

/**
 * 校验当前用户是否为管理员。
 * 通过返回 { error: null, user } 表示通过。
 * 返回 { error: NextResponse, user: null } 表示拒绝。
 */
export async function requireAdmin(req?: { headers: { get: (key: string) => string | null } }) {
  // 从 request headers 读取 userId（由 src/proxy.ts 注入）
  const userId = req?.headers.get(USER_ID_HEADER) ?? null;
  if (!userId) {
    return { error: NextResponse.json({ error: "未登录" }, { status: 401 }), user: null };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user) {
    return { error: NextResponse.json({ error: "用户不存在" }, { status: 401 }), user: null };
  }

  if (user.role !== "admin") {
    return { error: NextResponse.json({ error: "无管理员权限" }, { status: 403 }), user: null };
  }

  return { error: null, user };
}
