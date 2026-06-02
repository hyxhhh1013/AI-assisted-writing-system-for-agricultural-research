/**
 * GET /api/review/[id] — 获取单条审查详情
 */

import { NextRequest } from "next/server";
import { getReviewDetail } from "@/services/review-service";
import { getErrorMessage } from "@/lib/error-utils";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const detail = await getReviewDetail(id);

    if (!detail) {
      return Response.json(
        { success: false, error: "审查记录不存在" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      ...detail,
    });
  } catch (error: unknown) {
    console.error("[review/[id]] GET error:", error);
    return Response.json(
      { success: false, error: getErrorMessage(error) || "获取审查详情失败" },
      { status: 500 }
    );
  }
}
