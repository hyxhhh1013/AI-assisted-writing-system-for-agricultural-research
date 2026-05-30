/**
 * GET /api/review/history — 获取审查历史记录
 */

import { NextRequest } from "next/server";
import { getReviewHistory } from "@/services/review-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") || undefined;

    const history = await getReviewHistory(projectId);

    return Response.json({
      success: true,
      history,
    });
  } catch (error: any) {
    console.error("[review/history] GET error:", error);
    return Response.json(
      { success: false, error: error.message || "获取历史记录失败" },
      { status: 500 }
    );
  }
}
