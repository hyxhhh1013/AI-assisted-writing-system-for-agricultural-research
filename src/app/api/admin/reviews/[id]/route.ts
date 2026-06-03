import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { success, notFound } from "@/lib/admin-response";
import { getReviewDetail } from "@/services/review-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin(_req);
  if (error) return error;

  const { id } = await params;
  const detail = await getReviewDetail(id);
  if (!detail?.check) return notFound("审查记录不存在");

  const { check, issues } = detail;
  return success({
    check: {
      ...check,
      createdAt: check.createdAt instanceof Date ? check.createdAt.toISOString() : check.createdAt,
    },
    issues,
  });
}
