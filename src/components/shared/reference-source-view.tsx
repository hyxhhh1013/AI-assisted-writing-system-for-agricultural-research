"use client";

import Link from "next/link";
import { BookOpen, FileText, ExternalLink, Loader2, FileWarning } from "lucide-react";
import type { ReferenceSourceDetail } from "@/contracts/references";

/**
 * 引用「原文三态」展示：
 *   - full     知识库 PDF 原文片段 + 「阅读全文」跳转
 *   - abstract 外部导入摘要（无 PDF 全文，标记供概括引用）
 *   - bib_only 仅书目（无原文/摘要）
 */
export function ReferenceSourceView({
  detail,
  loading,
}: {
  detail: ReferenceSourceDetail | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
        <Loader2 className="h-3 w-3 animate-spin" />
        检索文献原文...
      </div>
    );
  }

  if (!detail) {
    return (
      <p className="text-[10px] text-muted-foreground italic py-1">
        未找到该引用的原文信息
      </p>
    );
  }

  if (detail.mode === "full" && detail.fullTextChunks && detail.fullTextChunks.length > 0) {
    return (
      <div className="space-y-2">
        {detail.fullTextChunks.map((chunk, ci) => (
          <div
            key={ci}
            className="text-[11px] leading-relaxed text-foreground bg-green-50 border border-green-200 rounded-md p-2.5"
          >
            {chunk.content}
          </div>
        ))}
        {detail.sourceName && (
          <Link
            href={`/reader?file=${encodeURIComponent(detail.sourceName)}`}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
          >
            <BookOpen className="h-3 w-3" />
            阅读全文
          </Link>
        )}
      </div>
    );
  }

  if (detail.mode === "abstract" && detail.abstract) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
          <FileWarning className="h-3 w-3" />
          外部导入 · 无 PDF 全文，以下为摘要（仅供概括引用）
        </div>
        <div className="text-[11px] leading-relaxed text-foreground bg-amber-50/60 border border-amber-200/60 rounded-md p-2.5">
          {detail.abstract}
        </div>
        {detail.openAccessUrl && (
          <a
            href={detail.openAccessUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            开放获取原文
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground italic">
        仅书目，无原文/摘要
      </p>
      {detail.doi && (
        <a
          href={`https://doi.org/${detail.doi}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
        >
          <FileText className="h-3 w-3" />
          DOI: {detail.doi}
        </a>
      )}
    </div>
  );
}
