import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { projectSectionPatchSchema } from "@/lib/validations";

// PATCH /api/projects/:id/sections/:key — 增量保存单个章节
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; key: string }> },
) {
  try {
    const { id, key } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { data, errorResponse: ve } = await validateBody(projectSectionPatchSchema, await req.json());
    if (ve) return ve;
    const { content } = data;

    const project = await prisma.project.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!project) return NextResponse.json({ error: "项目未找到" }, { status: 404 });

    await prisma.section.upsert({
      where: { projectId_key: { projectId: id, key } },
      update: { content },
      create: { projectId: id, key, content },
    });

    await prisma.project.update({
      where: { id },
      data: { lastUpdated: new Date() },
    });

    return NextResponse.json({ message: "保存成功" });
  } catch (error) {
    logger.error("Section PATCH error:", error);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
