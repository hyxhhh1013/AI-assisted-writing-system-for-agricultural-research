/**
 * POST /api/review/rounds — 审查下一轮（max 2）
 */

import { NextRequest } from "next/server";
import { validateBody } from "@/lib/api-validate";
import { reviewRoundsSchema } from "@/lib/validations";
import { runNextReviewRound } from "@/lib/review-rounds";
import { getUserIdFromRequest } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/api-response";
import { getErrorMessage } from "@/lib/error-utils";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return unauthorizedResponse();

  try {
    const { data, errorResponse: ve } = await validateBody(
      reviewRoundsSchema,
      await request.json(),
    );
    if (ve) return ve;

    const owned = await prisma.project.findFirst({
      where: { id: data.projectId, userId },
      select: { id: true },
    });
    if (!owned) {
      return Response.json({ success: false, error: "项目不存在或无权访问" }, { status: 404 });
    }

    const result = await runNextReviewRound(
      {
        projectId: data.projectId,
        title: data.title,
        sections: data.sections.map((s) => ({
          key: s.key,
          title: s.key,
          content: s.content,
        })),
        outline: data.outline,
        projectMode: data.projectMode,
        config: {
          dimensions: data.dimensions,
          target: data.target,
          projectMode: data.projectMode,
        },
      },
      { force: data.force },
    );

    return Response.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error("[review/rounds] POST error:", error);
    return Response.json(
      { success: false, error: getErrorMessage(error) || "审查编排失败" },
      { status: 500 },
    );
  }
}

/** GET /api/review/rounds?projectId= — 当前轮次状态 */
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return unauthorizedResponse();

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return Response.json({ success: false, error: "缺少 projectId" }, { status: 400 });
  }

  const owned = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!owned) {
    return Response.json({ success: false, error: "项目不存在或无权访问" }, { status: 404 });
  }

  const { getReviewRoundStatus } = await import("@/lib/review-rounds");
  const status = await getReviewRoundStatus(projectId);
  return Response.json({ success: true, status });
}
