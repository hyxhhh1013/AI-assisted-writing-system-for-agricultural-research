import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { paperPassportConfigPatchSchema } from "@/lib/validations";
import { updateProjectPaperPassportConfig } from "@/lib/project-paper-passport-sync";
import { serializePaperPassport } from "@/contracts/paper-passport";
import { getErrorMessage } from "@/lib/error-utils";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** PATCH /api/projects/:id/paper-passport — 更新 Phase 0 配置 */
export async function PATCH(
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
      paperPassportConfigPatchSchema,
      await req.json(),
    );
    if (errorResponse) return errorResponse;

    const passport = await updateProjectPaperPassportConfig(projectId, data.config);
    if (!passport) {
      return NextResponse.json({ error: "更新配置失败" }, { status: 500 });
    }

    return NextResponse.json({
      paperPassport: serializePaperPassport(passport),
      currentPhase: passport.currentPhase,
      phaseStatus: passport.phaseStatus,
    });
  } catch (error: unknown) {
    logger.error("Paper-passport PATCH failed:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "更新失败" },
      { status: 500 },
    );
  }
}
