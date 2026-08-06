import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { importExternalReferenceSchema } from "@/lib/validations";
import { importExternalReferenceToProject } from "@/lib/agent/import-reference";
import { findReferenceRowsLite } from "@/lib/reference-rows";
import type { ImportExternalReferenceResponse } from "@/contracts/literature";
import { logger } from "@/lib/logger";

/** POST /api/projects/:id/references/import-external — 外部文献加入参考文献 + 知识库摘要 */
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

    const result = await importExternalReferenceToProject(
      userId,
      projectId,
      data.hit,
      data.index,
    );

    const rows = await prisma.reference.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      select: { id: true, content: true, order: true },
    });
    const lite = await findReferenceRowsLite(projectId, userId);
    const byOrder = new Map(lite.map((r) => [r.order, r]));

    const body: ImportExternalReferenceResponse = {
      references: rows.map((r) => {
        const meta = byOrder.get(r.order);
        return {
          id: r.id,
          content: r.content,
          order: r.order,
          doi: meta?.doi ?? null,
          title: meta?.title ?? null,
          abstract: meta?.abstract ?? null,
          openAccessUrl: meta?.openAccessUrl ?? null,
          externalId: null,
          externalSource: meta?.externalSource ?? null,
        };
      }),
      citation: result.citation,
    };
    return NextResponse.json(body);
  } catch (error) {
    logger.error("Import external reference error:", error);
    const message = error instanceof Error ? error.message : "导入失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
