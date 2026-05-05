"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BookOpen, ChevronDown, ChevronRight, Quote } from "lucide-react";

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

/** 提取引用行预览：取前 60-70 字符展示作者+标题开头 */
function getRefPreview(ref: string): string {
  const cleaned = ref.replace(/^\[\d+\]\s*/, "").trim();
  // 按句子/逗号边界取前 65 字符
  const boundary = cleaned.search(/[。；;]\s*/);
  const cut = boundary > 10 && boundary < 65 ? boundary + 1 : 65;
  return cleaned.length > cut ? cleaned.slice(0, cut) + " ..." : cleaned;
}

/** 从章节内容中提取 [N] 所在段落及上下文 */
function findCitationContexts(
  content: string,
  citeNum: number,
): { paragraph: string; index: number }[] {
  if (!content) return [];
  const results: { paragraph: string; index: number }[] = [];
  const paragraphs = content.split(/\n\n+/);
  const re = new RegExp(`\\[${citeNum}(?:[,\\s\\-–—\\d]*)\\]`);
  for (const para of paragraphs) {
    if (re.test(para)) {
      // 截取引用前后最多 200 字符作为上下文
      const matchIdx = para.search(re);
      if (matchIdx === -1) continue;
      const start = Math.max(0, matchIdx - 80);
      const end = Math.min(para.length, matchIdx + 120);
      const snippet = (start > 0 ? "…" : "") + para.slice(start, end) + (end < para.length ? "…" : "");
      results.push({ paragraph: snippet, index: results.length });
    }
  }
  return results;
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

  const usedInSection = useMemo(
    () => collectUsedNumbers(activeSectionContent || "", references.length),
    [activeSectionContent, references.length],
  );

  const usedInPaper = useMemo(() => {
    if (!allContents) return usedInSection;
    const all = Object.values(allContents)
      .filter(Boolean)
      .join("\n\n");
    return collectUsedNumbers(all, references.length);
  }, [allContents, references.length, usedInSection]);

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
            const contexts = findCitationContexts(activeSectionContent || "", num);

            return (
              <Popover key={idx}>
                <PopoverTrigger
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
                <PopoverPopup className="w-[28rem]">
                  <div className="space-y-3 max-h-[70vh] overflow-y-auto">
                    {/* 引用来源 */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-muted-foreground">
                          参考文献 [{num}]
                        </span>
                        {isUsedInSection && (
                          <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                            当前章节引用
                          </span>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed text-foreground bg-muted/20 p-2 rounded-md">
                        {ref}
                      </p>
                    </div>

                    {/* 引用段落上下文 */}
                    {contexts.length > 0 && (
                      <div className="border-t pt-2">
                        <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mb-1.5">
                          <Quote className="h-3 w-3" />
                          文中引用位置
                        </span>
                        <div className="space-y-2">
                          {contexts.map((ctx, ci) => (
                            <div
                              key={ci}
                              className="text-[11px] leading-relaxed text-foreground bg-amber-50 border border-amber-200 rounded-md p-2.5"
                            >
                              {ctx.paragraph.split(/(\[[\d,\s\-–—]+\])/g).map((part, pi) => {
                                const isCite = /^\[[\d,\s\-–—]+\]$/.test(part);
                                const matchesOwn = new RegExp(`\\[${num}(?:[,\\s\\-–—\\d]*)\\]`).test(part);
                                return isCite ? (
                                  <span
                                    key={pi}
                                    className={cn(
                                      "font-bold",
                                      matchesOwn ? "text-blue-600" : "text-gray-400",
                                    )}
                                  >
                                    {part}
                                  </span>
                                ) : (
                                  <span key={pi}>{part}</span>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!isUsedInSection && isUsedInPaper && contexts.length === 0 && (
                      <p className="text-[10px] text-muted-foreground italic border-t pt-2">
                        该文献在其他章节被引用
                      </p>
                    )}
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
