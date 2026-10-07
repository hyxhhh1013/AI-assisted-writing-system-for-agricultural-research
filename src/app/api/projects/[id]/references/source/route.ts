import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { findReferenceRowsLite } from "@/lib/reference-rows";
import { localRAG } from "@/lib/rag";
import { getErrorMessage } from "@/lib/error-utils";
import type { ReferenceSourceDetail } from "@/contracts/references";
import { normalizeBibliographyDoi } from "@/lib/bib-import/doi";
import {
  findKnowledgePdfByDoi,
  isKnowledgePdfName,
  upsertReferencePdfSource,
  type KnowledgePdfHit,
} from "@/lib/reference-pdf-link";

/**
 * GET /api/projects/:id/references/source?refIndexes=1,2,3
 *
 * 按引用编号精确返回「原文三态」数据，供预览区引用角标弹窗 / 侧栏参考文献 popover 使用。
 * 取代旧实现里「用引用文本做语义检索猜原文」的做法（对外部导入的无 PDF 摘要文献失效）。
 *
 * 三态判定：
 *   - full      知识库 PDF（sourceName 或同 DOI 的知识库 PDF 可 getFullText 命中）→ 返回原文片段
 *   - abstract  有 Reference.abstract、索引里还没有全文 → 返回摘要（若已挂上 PDF 文件名，前端改提示）
 *   - bib_only  仅书目（无原文/摘要）→ 返回 citation + doi/openAccessUrl
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const refIndexes = (searchParams.get("refIndexes") || "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 1);

    if (refIndexes.length === 0) {
      return NextResponse.json({ error: "缺少 refIndexes" }, { status: 400 });
    }

    const owned = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: "项目未找到" }, { status: 404 });

    // 参考文献行（含 doi/title/abstract 证据列；order 为 0 基，[n] = order + 1）
    const rows = await findReferenceRowsLite(projectId, userId);
    const byOrder = new Map(rows.map((r) => [r.order, r]));

    // 引用→源映射（ReferenceSource.refIndex 为 1 基）
    const sources = await prisma.referenceSource.findMany({
      where: { projectId, refIndex: { in: refIndexes } },
      select: { refIndex: true, sourceName: true, category: true, citation: true },
    });
    const sourceByIndex = new Map(sources.map((s) => [s.refIndex, s]));
    const pdfByDoi = new Map<string, KnowledgePdfHit | null>();

    const items: ReferenceSourceDetail[] = await Promise.all(
      refIndexes.map(async (refIndex) => {
        const row = byOrder.get(refIndex - 1);
        const src = sourceByIndex.get(refIndex);
        let sourceName = src?.sourceName?.trim() || null;
        let category = src?.category ?? "";
        const citation =
          row?.content?.trim() || src?.citation?.trim() || `[${refIndex}]`;

        // 精确取知识库全文（sourceName 非知识库文件名时返回空串）
        let fullText = "";
        if (sourceName) {
          try {
            fullText = await localRAG.getFullText(sourceName);
          } catch {
            fullText = "";
          }
        }

        const doi = row?.doi?.trim() || null;
        const doiKey = doi ? normalizeBibliographyDoi(doi) : undefined;
        if (!fullText.trim() && doi && doiKey) {
          let pdf = pdfByDoi.get(doiKey);
          if (pdf === undefined) {
            try {
              pdf = await findKnowledgePdfByDoi(doi);
            } catch {
              pdf = null;
            }
            pdfByDoi.set(doiKey, pdf);
          }
          if (pdf) {
            const currentLeaf = sourceName?.replace(/\\/g, "/").split("/").pop()?.toLowerCase();
            const pdfLeaf = pdf.name.replace(/\\/g, "/").split("/").pop()?.toLowerCase();
            const sameFile = isKnowledgePdfName(sourceName) && currentLeaf === pdfLeaf;
            if (!sameFile) {
              let alt = "";
              try {
                alt = await localRAG.getFullText(pdf.name);
              } catch {
                alt = "";
              }
              if (alt.trim() || !isKnowledgePdfName(sourceName)) {
                sourceName = pdf.name;
                category = pdf.category || category;
                fullText = alt;
                try {
                  await upsertReferencePdfSource({
                    projectId,
                    refIndex,
                    sourceName: pdf.name,
                    category,
                    citation,
                  });
                } catch {
                  /* 挂接失败仍返回本次查到的文件名 */
                }
              }
            }
          }
        }

        const abstract = row?.abstract?.trim() || null;
        const openAccessUrl = row?.openAccessUrl?.trim() || null;
        const title = row?.title?.trim() || null;

        let mode: ReferenceSourceDetail["mode"];
        let fullTextChunks: ReferenceSourceDetail["fullTextChunks"] = null;
        if (fullText) {
          mode = "full";
          fullTextChunks = fullText
            .split(/\n\n+/)
            .map((p) => p.trim())
            .filter((p) => p.length > 10)
            .slice(0, 6)
            .map((content) => ({ content: content.slice(0, 1500) }));
        } else if (abstract) {
          mode = "abstract";
        } else {
          mode = "bib_only";
        }

        return {
          refIndex,
          citation,
          title,
          abstract,
          doi,
          openAccessUrl,
          sourceName,
          mode,
          fullTextChunks,
        };
      }),
    );

    return NextResponse.json({ items });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
