import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { success } from "@/lib/admin-response";
import { validateBody } from "@/lib/api-validate";
import { adminRebuildExternalAbstractsSchema } from "@/lib/validations";
import { rebuildExternalAbstractIndexes } from "@/lib/external-knowledge-ingest";

/**
 * POST /api/admin/knowledge/rebuild-external-abstracts
 * 补建已入库无 PDF 摘要的 RAG 索引，并按题名关键词自动归类。
 */
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const { data, errorResponse: ve } = await validateBody(
    adminRebuildExternalAbstractsSchema,
    body,
  );
  if (ve) return ve;

  const result = await rebuildExternalAbstractIndexes({
    onlyMissingChunks: data.all !== true,
    dryRun: data.dryRun === true,
    researchDirection: data.researchDirection,
  });

  return success(result, data.dryRun ? "干跑完成" : "外部摘要补建完成");
}
