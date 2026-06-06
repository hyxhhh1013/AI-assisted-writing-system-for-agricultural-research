import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { importExternalReferenceSchema } from "@/lib/validations";
import { applyReferencePatchOps } from "@/lib/project-references";
import { formatExternalLiteratureHit } from "@/lib/external-literature-format";
import type { ImportExternalReferenceResponse } from "@/contracts/literature";
import { logger } from "@/lib/logger";

/** POST /api/projects/:id/references/import-external — 外部文献加入参考文献 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { data, errorResponse: ve } = await validateBody(
      importExternalReferenceSchema,
      await req.json(),
    );
    if (ve) return ve;

    const owned = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: "项目未找到" }, { status: 404 });

    const citation = formatExternalLiteratureHit(data.hit);

    await prisma.$transaction(async (tx) => {
      await applyReferencePatchOps(tx, projectId, [
        { op: "create", content: citation, index: data.index },
      ]);
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { lastUpdated: new Date() },
    });

    const rows = await prisma.reference.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      select: { id: true, content: true, order: true },
    });

    const body: ImportExternalReferenceResponse = {
      references: rows,
      citation,
    };
    return NextResponse.json(body);
  } catch (error) {
    logger.error("Import external reference error:", error);
    return NextResponse.json({ error: "导入失败" }, { status: 500 });
  }
}
