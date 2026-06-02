import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { projectMetaPatchSchema } from "@/lib/validations";

// PATCH /api/projects/:id/meta — 增量更新项目元数据
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { data, errorResponse: ve } = await validateBody(projectMetaPatchSchema, await req.json());
    if (ve) return ve;

    const result = await prisma.project.updateMany({
      where: { id, userId },
      data: { ...data, lastUpdated: new Date() },
    });
    if (result.count === 0) return NextResponse.json({ error: "项目未找到" }, { status: 404 });

    return NextResponse.json({ message: "保存成功" });
  } catch (error) {
    logger.error("Meta PATCH error:", error);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
