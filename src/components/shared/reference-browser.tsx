"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BookOpen, ChevronDown, ChevronRight, Quote, FileText } from "lucide-react";
import { CITATION_GROUP_RE, FULLWIDTH_CITATION_RE, expandCitationGroup } from "@/lib/citation";
import { formatFilenames } from "@/services/references";
import { searchKnowledge } from "@/services/knowledge";
import { fetchReferenceSources } from "@/services/references";
import type { ReferenceSourceDetail } from "@/contracts/references";
import { ReferenceSourceView } from "@/components/shared/reference-source-view";
import { ReferenceProvenance } from "@/components/shared/reference-provenance";

function collectUsedNumbers(text: string, refCount: number): Set<number> {
  const set = new Set<number>();
  if (!text) return set;
  const normalized = text.replace(FULLWIDTH_CITATION_RE, (_m, inner) => `[${inner}]`);
  let m: RegExpExecArray | null;
  while ((m = CITATION_GROUP_RE.exec(normalized)) !== null) {
    for (const num of expandCitationGroup(m[1], refCount)) {
      set.add(num);
    }
  }
  return set;
}

function getRefPreview(ref: string): string {
  const cleaned = ref.replace(/^\[\d+\]\s*/, "").trim();
  const boundary = cleaned.search(/[。；;]\s*/);
  const cut = boundary > 10 && boundary < 65 ? boundary + 1 : 65;
  return cleaned.length > cut ? cleaned.slice(0, cut) + " ..." : cleaned;
}

/** 简单清理：去掉 .pdf 后缀、替换下划线/连字符为空格 */
function quickCleanFilename(raw: string): string {
  return raw
    .replace(/^\[\d+\]\s*/, "")
    .replace(/\.pdf$/i, "")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ReferenceBrowserProps {
  references: string[];
  projectId?: string;
  directionSlug?: string;
  activeSectionContent?: string;
  allContents?: Record<string, string>;
  className?: string;
  onGoImport?: () => void;
}

export function ReferenceBrowser({
  references,
  projectId,
  directionSlug,
  activeSectionContent,
  allContents,
  className,
  onGoImport,
}: ReferenceBrowserProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [loadingSource, setLoadingSource] = useState<number | null>(null);
  const [sourceDetails, setSourceDetails] = useState<Record<number, ReferenceSourceDetail | null>>({});

  // 批量格式化引用：文件名 → GB/T 7714
  const [formattedRefs, setFormattedRefs] = useState<Record<string, string>>({});
  const formatLoadedRef = useRef<string>("");

  useEffect(() => {
    if (references.length === 0) return;
    const key = references.join("|");
    if (key === formatLoadedRef.current) return;
    formatLoadedRef.current = key;

    const filenames = references;
    formatFilenames(filenames)
      .then((formatted) => setFormattedRefs(formatted))
      .catch(() => {});
  }, [references]);

  const usedInSection = useMemo(
    () => collectUsedNumbers(activeSectionContent || "", references.length),
    [activeSectionContent, references.length],
  );

  const usedInPaper = useMemo(() => {
    if (!allContents) return usedInSection;
    const all = Object.values(allContents).filter(Boolean).join("\n\n");
    return collectUsedNumbers(all, references.length);
  }, [allContents, references.length, usedInSection]);

  const fetchSourceContent = useCallback(async (num: number, refText: string) => {
    if (sourceDetails[num] !== undefined) return; // 已加载（含 null）

    setLoadingSource(num);
    try {
      if (projectId) {
        // 精确反查：按引用编号取原文三态（全文/摘要/书目）
        const items = await fetchReferenceSources(projectId, [num]);
        setSourceDetails((prev) => ({ ...prev, [num]: items[0] ?? null }));
        return;
      }

      // 无 projectId（项目未持久化）：退回语义检索兜底
      const keywords = refText
        .replace(/\[\d+\]\s*/, "")
        .split(/[,;，；]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 5)
        .slice(0, 3)
        .join(" ");

      if (!keywords) {
        setSourceDetails((prev) => ({ ...prev, [num]: null }));
        return;
      }

      const data = await searchKnowledge({ q: keywords, type: "semantic", pageSize: 5 });
      const chunks = (data.files || []).flatMap((f) =>
        (f._snippets || []).map((s: string) => ({ content: s }))
      );
      setSourceDetails((prev) => ({
        ...prev,
        [num]: chunks.length > 0
          ? {
              refIndex: num,
              citation: refText,
              title: null,
              abstract: null,
              doi: null,
              openAccessUrl: null,
              sourceName: null,
              mode: "full",
              fullTextChunks: chunks,
            }
          : null,
      }));
    } catch {
      setSourceDetails((prev) => ({ ...prev, [num]: null }));
    } finally {
      setLoadingSource(null);
    }
  }, [sourceDetails, projectId]);

  if (references.length === 0) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            参考文献
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground px-1 leading-relaxed">
          {directionSlug
            ? "暂无参考文献。本篇文献已在方向备料层导入，可回方向 corpus 调整，或使用侧栏「补录文献」追加。"
            : "暂无参考文献。可在侧栏「补录文献」检索 OpenAlex / PubMed 或从知识库 PDF 加入。"}
        </p>
        {directionSlug ? (
          <Link
            href={`/directions/${directionSlug}?tab=assets`}
            className="block w-full rounded-md border border-dashed border-[#6366f1]/30 bg-[#6366f1]/5 px-2 py-2 text-center text-[10px] font-medium text-[#6366f1] hover:bg-[#6366f1]/10"
          >
            回方向修改文献 corpus →
          </Link>
        ) : onGoImport ? (
          <button
            type="button"
            onClick={onGoImport}
            className="w-full rounded-md border border-dashed border-[#1a5632]/30 bg-[#1a5632]/5 px-2 py-2 text-[10px] font-medium text-[#1a5632] hover:bg-[#1a5632]/10"
          >
            去补录文献 →
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-1"
      >
        <span className="flex items-center gap-1.5 font-medium">
          <BookOpen className="h-3.5 w-3.5" />
          参考文献 ({references.length})
        </span>
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {!collapsed && (
        <div className="space-y-0.5">
          {references.map((ref, idx) => {
            const num = idx + 1;
            const isUsedInSection = usedInSection.has(num);
            const isUsedInPaper = usedInPaper.has(num);
            const formatted = formattedRefs[ref];
            const displayRef = formatted
              ? `[${num}] ${formatted}`
              : `[${num}] ${quickCleanFilename(ref)}`;
            const label = formatted
              ? (formatted.length > 65 ? formatted.slice(0, 65) + " ..." : formatted)
              : getRefPreview(`[${num}] ${quickCleanFilename(ref)}`);

            return (
              <Popover key={idx}>
                <PopoverTrigger
                  onClick={() => fetchSourceContent(num, ref)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded-md text-[11px] leading-snug transition-colors flex items-start gap-2 border border-transparent",
                    isUsedInSection
                      ? "bg-primary/10 text-primary border-primary/20"
                      : isUsedInPaper
                        ? "text-foreground hover:bg-muted"
                        : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[10px] mt-[2px]",
                      isUsedInSection ? "text-primary font-bold" : "text-muted-foreground",
                    )}
                  >
                    [{num}]
                  </span>
                  <span className="truncate">{label}</span>
                </PopoverTrigger>
                <PopoverPopup className="w-[32rem]">
                  <div className="space-y-3 max-h-[70vh] overflow-y-auto">
                    {/* 引用来源 */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-muted-foreground">
                          参考文献 [{num}]
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-foreground bg-muted/20 p-2 rounded-md">
                        {displayRef}
                      </p>
                    </div>

                    {/* 原文 / 摘要 */}
                    <div className="border-t pt-2">
                      <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mb-1.5">
                        <FileText className="h-3 w-3" />
                        原文 / 摘要
                      </span>

                      <ReferenceSourceView
                        detail={sourceDetails[num] ?? null}
                        loading={loadingSource === num}
                      />
                    </div>
                  </div>
                </PopoverPopup>
              </Popover>
            );
          })}
        </div>
      )}

      {usedInSection.size > 0 && !collapsed && (
        <p className="text-[9px] text-muted-foreground/60 px-1 pt-1">
          当前章节引用 [{Array.from(usedInSection).join(", ")}]
        </p>
      )}

      {projectId && !collapsed && (
        <ReferenceProvenance projectId={projectId} />
      )}
    </div>
  );
}
