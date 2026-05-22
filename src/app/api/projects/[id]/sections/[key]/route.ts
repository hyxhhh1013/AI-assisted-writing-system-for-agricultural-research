import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { IMRAD_SECTION_KEYS, SectionKey } from "@/lib/imrad";

// PATCH /api/projects/:id/sections/:key — 增量保存单个章节
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; key: string }> },
) {
  try {
    const { id, key } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { content } = await req.json();
    if (typeof content !== "string") {
      return NextResponse.json({ error: "content 必须为字符串" }, { status: 400 });
    }

    // 校验所有权
    const project = await prisma.project.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!project) return NextResponse.json({ error: "项目未找到" }, { status: 404 });

    // 增量 upsert 该章节
    await prisma.section.upsert({
      where: { projectId_key: { projectId: id, key } },
      update: { content },
      create: { projectId: id, key, content },
    });

    // 更新项目时间戳
    await prisma.project.update({
      where: { id },
      data: { lastUpdated: new Date() },
    });

    return NextResponse.json({ message: "保存成功" });
  } catch (error) {
    console.error("Section PATCH error:", error);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
