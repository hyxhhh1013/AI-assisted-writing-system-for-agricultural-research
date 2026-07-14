import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { paperPassportExportMarkSchema } from "@/lib/validations";
import { markProjectExportFormat } from "@/lib/project-paper-passport-sync";
import { serializePaperPassport } from "@/contracts/paper-passport";
import { getErrorMessage } from "@/lib/error-utils";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** POST /api/projects/:id/paper-passport/export — 标记已导出格式（Phase 7） */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const owned = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: "项目未找到" }, { status: 404 });
    }

    const { data, errorResponse } = await validateBody(
      paperPassportExportMarkSchema,
      await req.json(),
    );
    if (errorResponse) return errorResponse;

    const passport = await markProjectExportFormat(projectId, data.markExport);
    if (!passport) {
      return NextResponse.json({ error: "标记导出失败" }, { status: 500 });
    }

    return NextResponse.json({
      paperPassport: serializePaperPassport(passport),
      currentPhase: passport.currentPhase,
      phaseStatus: passport.phaseStatus,
    });
  } catch (error: unknown) {
    logger.error("Paper-passport export mark failed:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "标记失败" },
      { status: 500 },
    );
  }
}
