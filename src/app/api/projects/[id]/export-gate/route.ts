/**
 * GET /api/projects/:id/export-gate — 导出门禁状态（Phase 7）
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getProjectReviewGateState } from "@/lib/review-gate-db";
import { evaluateExportGate } from "@/contracts/review-gate";
import { getErrorMessage } from "@/lib/error-utils";

export const dynamic = "force-dynamic";

export async function GET(
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

    const state = await getProjectReviewGateState(projectId);
    const gate = evaluateExportGate({
      reviewDoneCount: state.doneCount,
      openHighIssueCount: state.openHighIssueCount,
    });

    return NextResponse.json({
      ...state,
      gate,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error) || "查询失败" },
      { status: 500 },
    );
  }
}
