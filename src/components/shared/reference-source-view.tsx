"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, ExternalLink, FileText, Loader2 } from "lucide-react";
import type { ReferenceSourceDetail } from "@/contracts/references";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 引用「原文三态」：
 *   - full     知识库 PDF 原文片段 + 「阅读全文」
 *   - abstract 外部导入摘要（无 PDF，仅供概括引用）
 *   - bib_only 仅书目
 */

function SourceAction({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: ReactNode;
}) {
  const className = cn(buttonVariants({ variant: "outline", size: "sm" }), "h-7 text-xs");
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function sourceModeLabel(mode: ReferenceSourceDetail["mode"]): string {
  if (mode === "full") return "知识库全文";
  if (mode === "abstract") return "仅摘要";
  return "仅书目";
}

export function SourceModePill({
  mode,
}: {
  mode: ReferenceSourceDetail["mode"];
}) {
  const label = sourceModeLabel(mode);
  const tone =
    mode === "full"
      ? "border-[#1a5632]/20 bg-[#1a5632]/8 text-[#1a5632]"
      : mode === "abstract"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-[#1a5632]/10 bg-[#f6f5f1] text-[#6b7c72]";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide",
        tone,
      )}
    >
      {label}
    </span>
  );
}

export function ReferenceSourceView({
  detail,
  loading,
  hideActions = false,
}: {
  detail: ReferenceSourceDetail | null;
  loading: boolean;
  /** 弹窗标题区已放主按钮时，正文不再重复 */
  hideActions?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-[#6b7c72]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        正在核对原文…
      </div>
    );
  }

  if (!detail) {
    return <p className="py-1 text-xs text-[#9aa8a0]">未找到该引用的原文信息</p>;
  }

  if (detail.mode === "full" && detail.fullTextChunks && detail.fullTextChunks.length > 0) {
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          {detail.fullTextChunks.map((chunk, ci) => (
            <p
              key={ci}
              className="border-l-2 border-[#1a5632]/40 bg-[#f6f5f1] py-2.5 pl-3 pr-3 text-[13px] leading-relaxed text-[#122820]"
            >
              {chunk.content}
            </p>
          ))}
        </div>
        {!hideActions && detail.sourceName ? (
          <SourceAction href={`/reader?file=${encodeURIComponent(detail.sourceName)}`}>
            <BookOpen className="h-3.5 w-3.5" />
            阅读全文
          </SourceAction>
        ) : null}
      </div>
    );
  }

  if (detail.mode === "abstract" && detail.abstract) {
    return (
      <div className="space-y-3">
        <p className="text-[11px] text-[#6b7c72]">无 PDF 全文，摘要仅供概括引用，核对事实请打开原文。</p>
        <div className="max-h-56 overflow-y-auto rounded-lg bg-[#f6f5f1] px-3.5 py-3 text-[13px] leading-relaxed text-[#122820]">
          {detail.abstract}
        </div>
        {!hideActions && detail.openAccessUrl ? (
          <SourceAction href={detail.openAccessUrl} external>
            <ExternalLink className="h-3.5 w-3.5" />
            开放获取原文
          </SourceAction>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[13px] text-[#6b7c72]">只有书目，没有摘要或 PDF。引用时不要编造文中没有的数据。</p>
      {!hideActions && detail.doi ? (
        <SourceAction href={`https://doi.org/${detail.doi}`} external>
          <FileText className="h-3.5 w-3.5" />
          DOI {detail.doi}
        </SourceAction>
      ) : null}
    </div>
  );
}

export function sourcePrimaryAction(detail: ReferenceSourceDetail | null): {
  href: string;
  external: boolean;
  label: string;
} | null {
  if (!detail) return null;
  if (detail.mode === "full" && detail.sourceName) {
    return {
      href: `/reader?file=${encodeURIComponent(detail.sourceName)}`,
      external: false,
      label: "阅读全文",
    };
  }
  if (detail.openAccessUrl) {
    return { href: detail.openAccessUrl, external: true, label: "开放获取原文" };
  }
  if (detail.doi) {
    return { href: `https://doi.org/${detail.doi}`, external: true, label: `DOI ${detail.doi}` };
  }
  return null;
}
