"use client";

import { cn } from "@/lib/utils";
import type { PlagiarismMatchResult } from "@/contracts/plagiarism";
import { splitContentByMatches } from "@/lib/plagiarism-utils";
import { riskDotClass } from "@/components/shared/plagiarism/constants";

interface MatchContentPreviewProps {
  content: string;
  matches: PlagiarismMatchResult[];
  compact?: boolean;
  maxHeight?: string;
}

function highlightClass(risk: PlagiarismMatchResult["riskLevel"]): string {
  if (risk === "high") return "bg-red-100/90 text-red-950 ring-1 ring-red-200";
  if (risk === "medium") return "bg-amber-100/90 text-amber-950 ring-1 ring-amber-200";
  return "bg-green-50/90 text-green-900 ring-1 ring-green-200";
}

export function MatchContentPreview({
  content,
  matches,
  compact = false,
  maxHeight = "280px",
}: MatchContentPreviewProps) {
  if (!content.trim()) return null;

  const parts = splitContentByMatches(content, matches);
  const hasHighlight = parts.some((p) => p.match);

  return (
    <div className={cn("rounded-xl border border-[#1a5632]/10 bg-[#faf9f6]", compact ? "p-3" : "p-4")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={cn("font-medium text-[#122820]", compact ? "text-xs" : "text-sm")}>正文预览</p>
        <div className="flex flex-wrap gap-2 text-[10px] text-[#9aa8a0]">
          <span className="inline-flex items-center gap-1"><span className={cn("h-1.5 w-1.5 rounded-full", riskDotClass("high"))} />高风险</span>
          <span className="inline-flex items-center gap-1"><span className={cn("h-1.5 w-1.5 rounded-full", riskDotClass("medium"))} />中风险</span>
        </div>
      </div>
      <div
        className={cn(
          "overflow-y-auto rounded-lg border bg-white p-3 text-[#3d4f46] leading-relaxed whitespace-pre-wrap",
          compact ? "text-xs" : "text-sm",
        )}
        style={{ maxHeight }}
      >
        {hasHighlight ? (
          parts.map((part, i) =>
            part.match ? (
              <mark
                key={i}
                className={cn("rounded px-0.5", highlightClass(part.match.riskLevel))}
                title={`相似度 ${(part.match.similarity * 100).toFixed(0)}% · ${part.match.matchedFrom}`}
              >
                {part.text}
              </mark>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )
        ) : (
          <span>{content.slice(0, 4000)}{content.length > 4000 ? "…" : ""}</span>
        )}
      </div>
      {!hasHighlight && matches.length > 0 && (
        <p className="mt-2 text-[10px] text-[#9aa8a0]">匹配段落在当前正文中未定位到原文（可能为 AI 评估或套话类提示）</p>
      )}
    </div>
  );
}
