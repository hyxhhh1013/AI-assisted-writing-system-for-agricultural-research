"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlagiarismMatchResult } from "@/contracts/plagiarism";
import { MATCH_ICONS, MATCH_TYPE_LABELS, riskDotClass } from "./constants";

interface PlagiarismMatchRowProps {
  match: PlagiarismMatchResult;
  index: number;
  compact?: boolean;
}

export function PlagiarismMatchRow({ match, index, compact = false }: PlagiarismMatchRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border bg-card">
      <div
        className={cn(
          "flex cursor-pointer select-none items-center hover:bg-muted/30 transition-colors",
          compact ? "gap-1.5 px-2 py-1.5" : "gap-2 px-3 py-2",
        )}
        onClick={() => setOpen(!open)}
      >
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", riskDotClass(match.riskLevel))} />
        <span className={cn("shrink-0 text-muted-foreground", compact ? "w-4 text-[10px]" : "w-5 text-xs")}>
          {index + 1}
        </span>
        <p className={cn("flex-1 truncate text-muted-foreground", compact ? "text-xs" : "text-sm")}>
          {match.sourceText.slice(0, compact ? 55 : 70)}...
        </p>
        <Badge
          variant="outline"
          className={cn("shrink-0 tabular-nums", compact ? "h-4 px-1 text-[10px]" : "text-xs")}
        >
          {(match.similarity * 100).toFixed(0)}%
        </Badge>
        <span className={cn("shrink-0", compact ? "text-[10px]" : "text-xs")}>
          {MATCH_ICONS[match.matchType]}
          {!compact && (
            <span className="ml-0.5 text-[10px] text-muted-foreground">
              {MATCH_TYPE_LABELS[match.matchType]}
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className={cn("shrink-0 text-muted-foreground/50", compact ? "h-3 w-3" : "h-4 w-4")} />
        ) : (
          <ChevronDown className={cn("shrink-0 text-muted-foreground/50", compact ? "h-3 w-3" : "h-4 w-4")} />
        )}
      </div>
      {open && (
        <div className={cn("border-t space-y-1", compact ? "px-2 pb-2 pt-1 text-xs" : "space-y-2 px-3 pb-3 pt-2")}>
          <p className="truncate text-muted-foreground">
            来源：
            {match.matchedUrl ? (
              <a href={match.matchedUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {match.matchedFrom}
              </a>
            ) : (
              match.matchedFrom
            )}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className={cn("rounded border border-red-100 bg-red-50", compact ? "p-2" : "rounded-lg p-3")}>
              <span className="mb-0.5 block text-[10px] text-red-400">原文</span>
              <p className="leading-relaxed text-foreground/70">{match.sourceText}</p>
            </div>
            <div className={cn("rounded border border-amber-100 bg-amber-50", compact ? "p-2" : "rounded-lg p-3")}>
              <span className="mb-0.5 block text-[10px] text-amber-400">匹配内容</span>
              <p className="leading-relaxed text-foreground/70">
                {compact ? match.matchedText.slice(0, 120) : match.matchedText}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
