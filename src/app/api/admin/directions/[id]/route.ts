import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { success, notFound, badRequest } from "@/lib/admin-response";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

/** PATCH — 切换方向 active ↔ archived */
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (status !== "active" && status !== "archived") {
    return badRequest("status 仅支持 active / archived");
  }

  const result = await prisma.direction.updateMany({ where: { id }, data: { status } });
  if (result.count === 0) return notFound("方向不存在");
  return success(undefined, status === "active" ? "已启用" : "已归档");
}
