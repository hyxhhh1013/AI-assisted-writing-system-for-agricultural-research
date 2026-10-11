"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlagiarismMatchResult } from "@/contracts/plagiarism";
import { presentMatchDetail } from "@/lib/plagiarism-utils";
import { MATCH_TYPE_LABELS, riskDotClass } from "./constants";

function findingLines(text: string): string[] {
  return presentMatchDetail(text)
    .split(/[；;\n]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isStyleNote(match: PlagiarismMatchResult): boolean {
  return match.similarity === 0 && (match.sourceLength ?? 0) === 0;
}

interface PlagiarismMatchRowProps {
  match: PlagiarismMatchResult;
  index: number;
  compact?: boolean;
}

export function PlagiarismMatchRow({ match, index, compact = false }: PlagiarismMatchRowProps) {
  const note = isStyleNote(match);
  const [open, setOpen] = useState(!compact && index === 0);
  const findings = findingLines(match.matchedText);
  const hideSource = match.matchedFrom.startsWith("套话分析");

  return (
    <div className="rounded-lg border bg-card">
      <div
        className={cn(
          "flex cursor-pointer select-none items-start hover:bg-muted/30 transition-colors",
          compact ? "gap-1.5 px-2 py-1.5" : "gap-2 px-3 py-2.5",
        )}
        onClick={() => setOpen(!open)}
      >
        <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", riskDotClass(match.riskLevel))} />
        <span className={cn("shrink-0 text-muted-foreground", compact ? "w-4 text-[10px]" : "w-5 text-xs")}>
          {index + 1}
        </span>
        <p className={cn("min-w-0 flex-1 text-[#122820]", compact ? "truncate text-xs" : "text-sm leading-snug")}>
          {compact ? `${match.sourceText.slice(0, 55)}…` : match.sourceText}
        </p>
        {!note && (
          <Badge
            variant="outline"
            className={cn("shrink-0 tabular-nums", compact ? "h-4 px-1 text-[10px]" : "text-xs")}
          >
            {(match.similarity * 100).toFixed(0)}%
          </Badge>
        )}
        <span className={cn("shrink-0 text-[#6b7c72]", compact ? "text-[10px]" : "text-xs")}>
          {MATCH_TYPE_LABELS[match.matchType]}
        </span>
        {open ? (
          <ChevronUp className={cn("mt-0.5 shrink-0 text-muted-foreground/50", compact ? "h-3 w-3" : "h-4 w-4")} />
        ) : (
          <ChevronDown className={cn("mt-0.5 shrink-0 text-muted-foreground/50", compact ? "h-3 w-3" : "h-4 w-4")} />
        )}
      </div>
      {open && (
        <div className={cn("space-y-2 border-t", compact ? "px-2 pb-2 pt-1 text-xs" : "px-3 pb-3 pt-3")}>
          {!hideSource && (
            <p className="break-words text-xs leading-relaxed text-[#6b7c72]">
              来源：
              {match.matchedUrl ? (
                <a href={match.matchedUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {match.matchedFrom}
                </a>
              ) : (
                match.matchedFrom
              )}
            </p>
          )}
          {note && findings.length > 1 ? (
            <ul className="space-y-1.5">
              {findings.map((line) => (
                <li key={line} className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-[#3d3420]">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <div className="grid gap-2">
              <div className={cn("rounded-lg border border-red-100 bg-red-50", compact ? "p-2" : "p-3")}>
                <span className="mb-1 block text-[10px] text-red-400">原文</span>
                <p className="text-sm leading-relaxed text-foreground/80">{match.sourceText}</p>
              </div>
              <div className={cn("rounded-lg border border-amber-100 bg-amber-50", compact ? "p-2" : "p-3")}>
                <span className="mb-1 block text-[10px] text-amber-500">匹配内容</span>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                  {compact ? presentMatchDetail(match.matchedText).slice(0, 160) : presentMatchDetail(match.matchedText)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
