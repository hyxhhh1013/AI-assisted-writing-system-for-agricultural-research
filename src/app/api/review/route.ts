/**
 * POST /api/review — 执行论文审查
 *
 * 4 维度并行审查，生成结构化报告
 */

import { NextRequest } from "next/server";
import { validateBody } from "@/lib/api-validate";
import { reviewSchema } from "@/lib/validations";
import { runReview } from "@/services/review-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { data, errorResponse: ve } = await validateBody(reviewSchema, await request.json());
    if (ve) return ve;

    const report = await runReview(
      {
        projectId: data.projectId,
        title: data.title,
        sections: data.sections.map((s: any) => ({
          key: s.key,
          title: s.key, // 使用 key 作为 title
          content: s.content,
        })),
        outline: data.outline,
        config: {
          dimensions: data.dimensions as any,
          target: data.target,
        },
      }
    );

    return Response.json({
      success: true,
      report,
    });
  } catch (error: any) {
    console.error("[review] POST error:", error);
    return Response.json(
      { success: false, error: error.message || "审查失败" },
      { status: 500 }
    );
  }
}
