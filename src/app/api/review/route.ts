/**
 * POST /api/review — 执行论文审查
 *
 * 4 维度并行审查，生成结构化报告
 */

import { NextRequest } from "next/server";
import { validateBody } from "@/lib/api-validate";
import { reviewSchema, type ReviewInput as ReviewBody } from "@/lib/validations";
import { runReview } from "@/services/review-service";
import { getErrorMessage } from "@/lib/error-utils";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { data, errorResponse: ve } = await validateBody(reviewSchema, await request.json());
    if (ve) return ve;

    const body: ReviewBody = data;
    const report = await runReview({
      projectId: body.projectId,
      title: body.title,
      sections: body.sections.map((s) => ({
        key: s.key,
        title: s.key,
        content: s.content,
      })),
      outline: body.outline,
      config: {
        dimensions: body.dimensions,
        target: body.target,
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
