import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { syncProjectPaperPassport } from "@/lib/project-paper-passport-sync";
import { serializePaperPassport } from "@/contracts/paper-passport";
import { getErrorMessage } from "@/lib/error-utils";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** POST /api/projects/:id/paper-passport/sync — 根据项目快照重算阶段进度 */
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

    const passport = await syncProjectPaperPassport(projectId);
    if (!passport) {
      return NextResponse.json({ error: "项目无 PaperPassport" }, { status: 404 });
    }

    return NextResponse.json({
      paperPassport: serializePaperPassport(passport),
      currentPhase: passport.currentPhase,
      phaseStatus: passport.phaseStatus,
    });
  } catch (error: unknown) {
    logger.error("Paper-passport sync failed:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "同步失败" },
      { status: 500 },
    );
  }
}
