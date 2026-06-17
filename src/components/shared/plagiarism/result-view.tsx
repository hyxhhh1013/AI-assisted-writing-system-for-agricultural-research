"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlagiarismCheckResult } from "@/contracts/plagiarism";
import { MATCH_ICONS, riskBadgeClass, riskLabel } from "./constants";
import { PlagiarismMatchRow } from "./match-row";
import { PlagiarismStatsReport } from "@/components/shared/quality/stats-report";

interface PlagiarismResultViewProps {
  result: PlagiarismCheckResult;
  compact?: boolean;
  onRewrite: () => void;
  onReCheck: () => void;
}

export function PlagiarismResultView({ result, compact = false, onRewrite, onReCheck }: PlagiarismResultViewProps) {
  const typeStats = result.matches.reduce<Record<string, number>>((acc, m) => {
    acc[m.matchType] = (acc[m.matchType] || 0) + 1;
    return acc;
  }, {});

  const riskCls = riskBadgeClass(result.overallRisk);
  const barColor =
    result.overallRisk === "high" ? "bg-red-500" : result.overallRisk === "medium" ? "bg-amber-500" : "bg-green-500";
  const textColor =
    result.overallRisk === "high" ? "text-red-600" : result.overallRisk === "medium" ? "text-amber-600" : "text-green-600";

  return (
    <div className={cn("flex flex-col", compact ? "h-full gap-1.5" : "gap-3")}>
      <div className={cn("rounded-lg border bg-muted/30", compact ? "flex items-center gap-2 p-2" : "p-3")}>
        <div className={cn("flex items-center justify-between", compact ? "w-full" : "mb-3")}>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className={cn("font-bold tabular-nums", compact ? "text-lg" : "text-2xl", textColor)}>
              {(result.maxSimilarity * 100).toFixed(1)}%
            </span>
            <div>
              <Badge variant="secondary" className={cn("text-[10px]", riskCls)}>
                {riskLabel(result.overallRisk)}
              </Badge>
              {!compact && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">{result.totalMatches} 处匹配</p>
              )}
            </div>
            {compact && <span className="ml-auto text-xs text-muted-foreground">{result.totalMatches} 处匹配</span>}
          </div>
          {!compact && (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onReCheck}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                重新检测
              </Button>
              {result.matches.length > 0 && (
                <Button size="sm" onClick={onRewrite}>
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  AI 降重
                </Button>
              )}
            </div>
          )}
        </div>
        {!compact && (
          <>
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all duration-500", barColor)}
                style={{ width: `${result.maxSimilarity * 100}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
              {Object.entries(typeStats).map(([t, n]) => (
                <span key={t}>
                  {MATCH_ICONS[t as keyof typeof MATCH_ICONS]} {n}
                </span>
              ))}
            </div>
            {result.stats && (
              <div className="mt-3 border-t pt-3">
                <p className="mb-2 text-xs font-medium text-[#122820]">分层检测统计</p>
                <PlagiarismStatsReport stats={result.stats} />
              </div>
            )}
          </>
        )}
      </div>

      {compact && (
        <div className="h-1 shrink-0 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all duration-500", barColor)}
            style={{ width: `${result.maxSimilarity * 100}%` }}
          />
        </div>
      )}

      <div className={cn(compact ? "min-h-0 flex-1 overflow-y-auto -mx-1 px-1" : "")}>
        {result.matches.length > 0 ? (
          <div className={compact ? "space-y-1" : "space-y-1.5"}>
            {result.matches.map((m, i) => (
              <PlagiarismMatchRow key={m.id} match={m} index={i} compact={compact} />
            ))}
          </div>
        ) : (
          <div className={cn("flex flex-col items-center justify-center text-muted-foreground", compact ? "h-full" : "py-16")}>
            <CheckCircle2 className={cn("mb-1 text-green-500", compact ? "h-6 w-6" : "h-8 w-8 mb-2")} />
            <p className={compact ? "text-xs" : "text-sm"}>未发现相似内容</p>
          </div>
        )}
      </div>

      {compact && (
        <div className="flex shrink-0 gap-1.5 border-t pt-1.5">
          <Button variant="ghost" size="sm" className="h-7 flex-1 text-xs" onClick={onReCheck}>
            <RefreshCw className="mr-1 h-3 w-3" />
            重新检测
          </Button>
          {result.matches.length > 0 && (
            <Button size="sm" className="h-7 flex-1 text-xs" onClick={onRewrite}>
              <Sparkles className="mr-1 h-3 w-3" />
              AI 降重
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
