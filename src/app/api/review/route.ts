/**
 * POST /api/review — 执行论文审查
 *
 * 4 维度并行审查，生成结构化报告；同一项目最多 2 轮（Phase 6）。
 */

import { NextRequest } from "next/server";
import { validateBody } from "@/lib/api-validate";
import { reviewSchema, type ReviewInput as ReviewBody } from "@/lib/validations";
import { runReview } from "@/services/review-service";
import { getUserIdFromRequest } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/api-response";
import { getErrorMessage } from "@/lib/error-utils";
import { evaluateReviewRoundGate } from "@/contracts/review-gate";
import { getProjectReviewGateState } from "@/lib/review-gate-db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return unauthorizedResponse();

  try {
    const { data, errorResponse: ve } = await validateBody(reviewSchema, await request.json());
    if (ve) return ve;

    const body: ReviewBody = data;

    if (body.projectId) {
      const gateState = await getProjectReviewGateState(body.projectId);
      const roundGate = evaluateReviewRoundGate(gateState.doneCount);
      if (!roundGate.ok) {
        return Response.json(
          {
            success: false,
            error: roundGate.reason,
            code: roundGate.code,
            doneCount: roundGate.doneCount,
          },
          { status: 409 },
        );
      }
    }

    const report = await runReview({
      projectId: body.projectId,
      title: body.title,
      sections: body.sections.map((s) => ({
        key: s.key,
        title: s.key,
        content: s.content,
      })),
      outline: body.outline,
      projectMode: body.projectMode,
      config: {
        dimensions: body.dimensions,
        target: body.target,
        projectMode: body.projectMode,
      },
    });

    return Response.json({
      success: true,
      report,
    });
  } catch (error: unknown) {
    console.error("[review] POST error:", error);
    return Response.json(
      { success: false, error: getErrorMessage(error) || "审查失败" },
      { status: 500 }
    );
  }
}
