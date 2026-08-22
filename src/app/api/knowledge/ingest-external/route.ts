import { NextRequest, NextResponse } from "next/server";
import { validateBody } from "@/lib/api-validate";
import { ingestExternalKnowledgeSchema } from "@/lib/validations";
import { ingestExternalHitToKnowledge } from "@/lib/external-knowledge-ingest";
import type { IngestExternalKnowledgeResponse } from "@/contracts/literature";
import { getErrorMessage } from "@/lib/error-utils";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/knowledge/ingest-external");

function buildIngestMessage(r: {
  mode: "pdf" | "abstract" | "bib_only";
  reason?: string;
  chunkCount: number;
  created: boolean;
  updated: boolean;
}): string {
  const verb = r.created ? "已入库" : r.updated ? "已更新" : "已处理";
  if (r.mode === "pdf") {
    if (r.reason === "oa_pdf_index_failed") {
      return `${verb} OA PDF，但增量索引失败（chunk=${r.chunkCount}）。请到本地库点「重新构建索引」。`;
    }
    if (r.reason === "doi_duplicate_pdf_exists") {
      return `知识库已有该 PDF（${r.chunkCount} 块），已合并书目。`;
    }
    if (r.chunkCount > 0) {
      return `${verb}并完成全文索引（${r.chunkCount} 块）。`;
    }
    return `${verb} OA PDF，正在等待索引块同步（可刷新本地库查看）。`;
  }
  if (r.mode === "abstract") {
    return `${verb}：摘要已索引（${r.chunkCount} 块）。无全文，深度引用仍受限。`;
  }
  return `${verb}书目占位（无摘要/无 OA PDF）。请上传 PDF 后再构建索引。`;
}

/**
 * POST /api/knowledge/ingest-external
 * 外部文献 → 知识库（尝试 OA 下载 + 增量索引 / 摘要 chunk / 仅书目）
 */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { data, errorResponse } = await validateBody(
      ingestExternalKnowledgeSchema,
      await req.json(),
    );
    if (errorResponse) return errorResponse;

    const result = await ingestExternalHitToKnowledge({
      hit: data.hit,
      category: data.category,
      directionSlug: data.directionSlug,
      researchDirection: data.researchDirection,
      tryOaPdf: data.tryOaPdf,
    });

    const body: IngestExternalKnowledgeResponse = {
      name: result.name,
      category: result.category,
      created: result.created,
      updated: result.updated,
      chunkCount: result.chunkCount,
      mode: result.mode,
      reason: result.reason,
      pdfBytes: result.pdfBytes,
      message: buildIngestMessage(result),
    };

    return NextResponse.json(body);
  } catch (error: unknown) {
    log.fail("ingest-external failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "加入知识库失败" },
      { status: 500 },
    );
  }
}
