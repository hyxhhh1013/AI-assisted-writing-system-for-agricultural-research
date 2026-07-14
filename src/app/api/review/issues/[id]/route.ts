/**
 * PATCH /api/review/issues/:id — 更新审查问题状态（fixed / dismissed）
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api-validate";
import { getUserIdFromRequest } from "@/lib/auth";
import { unauthorizedResponse } from "@/lib/api-response";
import { getErrorMessage } from "@/lib/error-utils";
import { updateReviewIssueStatus } from "@/lib/review-gate-db";

export const dynamic = "force-dynamic";

const patchIssueSchema = z.object({
  status: z.enum(["open", "fixed", "dismissed"]),
  fixedContent: z.string().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return unauthorizedResponse();

  try {
    const { id } = await params;
    const { data, errorResponse } = await validateBody(
      patchIssueSchema,
      await request.json(),
    );
    if (errorResponse) return errorResponse;

    const ok = await updateReviewIssueStatus(
      id,
      data.status,
      data.fixedContent,
    );
    if (!ok) {
      return Response.json({ success: false, error: "问题不存在" }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error: unknown) {
    return Response.json(
      { success: false, error: getErrorMessage(error) || "更新失败" },
      { status: 500 },
    );
  }
}
