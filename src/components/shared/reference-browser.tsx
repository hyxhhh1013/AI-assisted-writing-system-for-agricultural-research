"use client";

import { useMemo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BookOpen, ChevronDown, ChevronRight, Quote, FileText, Loader2 } from "lucide-react";

const CITATION_GROUP_RE = /\[([0-9,\s\-–—]+)\]/g;

function expandCitationGroup(raw: string, refCount: number): number[] {
  const nums: number[] = [];
  const parts = raw.split(",");
  for (const part of parts) {
    const token = part.trim();
    if (!token) continue;
    const range = token.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (range) {
      const start = Math.max(1, parseInt(range[1], 10));
      const end = Math.min(refCount, parseInt(range[2], 10));
      for (let n = Math.min(start, end); n <= Math.max(start, end); n++) {
        if (!nums.includes(n)) nums.push(n);
      }
      continue;
    }
    const single = token.match(/^\d+$/);
    if (single) {
      const n = parseInt(token, 10);
      if (n >= 1 && n <= refCount && !nums.includes(n)) nums.push(n);
    }
  }
  return nums;
}

function collectUsedNumbers(text: string, refCount: number): Set<number> {
  const set = new Set<number>();
  if (!text) return set;
  let m: RegExpExecArray | null;
  while ((m = CITATION_GROUP_RE.exec(text)) !== null) {
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

interface LiteratureChunk {
  content: string;
  index: number;
}

interface ReferenceBrowserProps {
  references: string[];
  activeSectionContent?: string;
  allContents?: Record<string, string>;
  className?: string;
}

export function ReferenceBrowser({
  references,
  activeSectionContent,
  allContents,
  className,
}: ReferenceBrowserProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [loadingSource, setLoadingSource] = useState<number | null>(null);
  const [sourceChunks, setSourceChunks] = useState<Record<number, LiteratureChunk[]>>({});

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
    if (sourceChunks[num]) return; // 已加载

    setLoadingSource(num);
    try {
      // 从引用文字中提取关键词，搜索知识库
      const keywords = refText
        .replace(/\[\d+\]\s*/, "")
        .split(/[,;，；]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 5)
        .slice(0, 3)
        .join(" ");

      if (!keywords) {
        setSourceChunks((prev) => ({ ...prev, [num]: [] }));
        return;
      }

      const res = await fetch(`/api/knowledge?q=${encodeURIComponent(keywords)}&type=semantic&pageSize=5`);
      const data = await res.json();
      const chunks: LiteratureChunk[] = (data.files || []).flatMap((f: any) =>
        (f._snippets || []).map((s: string, i: number) => ({
          content: s,
          index: i + 1,
        }))
      );
      setSourceChunks((prev) => ({ ...prev, [num]: chunks }));
    } catch {
      setSourceChunks((prev) => ({ ...prev, [num]: [] }));
    } finally {
      setLoadingSource(null);
    }
  }, [sourceChunks]);

  if (references.length === 0) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            参考文献
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground italic px-1">暂无参考文献</p>
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
        <div className="space-y-0.5 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
          {references.map((ref, idx) => {
            const num = idx + 1;
            const isUsedInSection = usedInSection.has(num);
            const isUsedInPaper = usedInPaper.has(num);
            const label = getRefPreview(ref);
            const chunks = sourceChunks[num];

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
                        {ref}
                      </p>
                    </div>

                    {/* 知识库原文 */}
                    <div className="border-t pt-2">
                      <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mb-1.5">
                        <FileText className="h-3 w-3" />
                        知识库原文
                      </span>

                      {loadingSource === num ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          检索文献原文...
                        </div>
                      ) : chunks && chunks.length > 0 ? (
                        <div className="space-y-2">
                          {chunks.map((chunk, ci) => (
                            <div
                              key={ci}
                              className="text-[11px] leading-relaxed text-foreground bg-green-50 border border-green-200 rounded-md p-2.5"
                            >
                              {chunk.content}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground italic">
                          暂未在知识库中找到匹配文献原文
                        </p>
                      )}
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
    </div>
  );
}
