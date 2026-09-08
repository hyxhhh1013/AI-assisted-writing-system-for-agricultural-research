"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlagiarismCheckResult, PlagiarismMatchType } from "@/contracts/plagiarism";
import { MATCH_TYPE_ICONS, MATCH_TYPE_LABELS, riskBadgeClass, riskLabel } from "./constants";
import { PlagiarismMatchRow } from "./match-row";
import { PlagiarismStatsReport } from "@/components/shared/quality/stats-report";
import { MatchContentPreview } from "@/components/shared/quality/match-content-preview";

interface PlagiarismResultViewProps {
  result: PlagiarismCheckResult;
  compact?: boolean;
  sourceContent?: string;
  onRewrite: () => void;
  onReCheck: () => void;
}

const FILTERS: Array<{ id: "all" | PlagiarismMatchType; label: string }> = [
  { id: "all", label: "全部" },
  { id: "self", label: "自引" },
  { id: "cross", label: "跨项目" },
  { id: "local", label: "知识库" },
  { id: "web", label: "联网" },
  { id: "ai", label: "AI" },
];

export function PlagiarismResultView({ result, compact = false, sourceContent, onRewrite, onReCheck }: PlagiarismResultViewProps) {
  const [typeFilter, setTypeFilter] = useState<"all" | PlagiarismMatchType>("all");

  const typeStats = result.matches.reduce<Record<string, number>>((acc, m) => {
    acc[m.matchType] = (acc[m.matchType] || 0) + 1;
    return acc;
  }, {});

  const filtered = useMemo(
    () => typeFilter === "all" ? result.matches : result.matches.filter((m) => m.matchType === typeFilter),
    [result.matches, typeFilter],
  );

  const riskCls = riskBadgeClass(result.overallRisk);
  const barColor =
    result.overallRisk === "high" ? "bg-red-500" : result.overallRisk === "medium" ? "bg-amber-500" : "bg-green-500";
  const textColor =
    result.overallRisk === "high" ? "text-red-600" : result.overallRisk === "medium" ? "text-amber-600" : "text-green-600";

  return (
    <div className={cn("flex flex-col", compact ? "h-full gap-1.5" : "gap-3")}>
      <div className={cn("rounded-xl border border-[#1a5632]/10 bg-[#faf9f6]", compact ? "flex items-center gap-2 p-2" : "p-4")}>
        <div className={cn("flex items-center justify-between", compact ? "w-full" : "mb-3")}>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className={cn("font-bold tabular-nums", compact ? "text-lg" : "text-3xl", textColor)}>
              {(result.maxSimilarity * 100).toFixed(1)}%
            </span>
            <div>
              <Badge variant="secondary" className={cn("text-[10px]", riskCls)}>
                {riskLabel(result.overallRisk)}
              </Badge>
              {!compact && (
                <p className="mt-0.5 text-[11px] text-[#6b7c72]">最高相似度 · {result.totalMatches} 处匹配</p>
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
                <Button size="sm" className="bg-[#1a5632] hover:bg-[#144a2a]" onClick={onRewrite}>
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  AI 降重
                </Button>
              )}
            </div>
          )}
        </div>
        {!compact && (
          <>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-[#1a5632]/10">
              <div
                className={cn("h-full rounded-full transition-all duration-500", barColor)}
                style={{ width: `${Math.min(100, result.maxSimilarity * 100)}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-[#6b7c72]">
              {Object.entries(typeStats).map(([t, n]) => {
                const Icon = MATCH_TYPE_ICONS[t as PlagiarismMatchType];
                return (
                  <span key={t} className="inline-flex items-center gap-1">
                    {Icon && <Icon className="h-3 w-3" />}
                    {MATCH_TYPE_LABELS[t as PlagiarismMatchType] ?? t} {n}
                  </span>
                );
              })}
            </div>
            {result.stats && (
              <div className="mt-3 border-t border-[#1a5632]/10 pt-3">
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
            style={{ width: `${Math.min(100, result.maxSimilarity * 100)}%` }}
          />
        </div>
      )}

      {!compact && sourceContent && result.matches.length > 0 && (
        <MatchContentPreview content={sourceContent} matches={result.matches} />
      )}

      {!compact && result.matches.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] transition-colors",
                typeFilter === f.id ? "bg-[#1a5632] text-white" : "bg-[#faf9f6] text-[#6b7c72] hover:bg-[#1a5632]/8",
              )}
              onClick={() => setTypeFilter(f.id)}
            >
              {f.label}
              {f.id !== "all" && typeStats[f.id] ? ` ${typeStats[f.id]}` : ""}
            </button>
          ))}
        </div>
      )}

      <div className={cn(compact ? "min-h-0 flex-1 overflow-y-auto -mx-1 px-1" : "")}>
        {filtered.length > 0 ? (
          <div className={compact ? "space-y-1" : "space-y-1.5"}>
            {filtered.map((m, i) => (
              <PlagiarismMatchRow key={m.id} match={m} index={i} compact={compact} />
            ))}
          </div>
        ) : (
          <div className={cn("flex flex-col items-center justify-center text-muted-foreground", compact ? "h-full" : "py-16")}>
            <CheckCircle2 className={cn("mb-1 text-green-500", compact ? "h-6 w-6" : "h-8 w-8 mb-2")} />
            <p className={compact ? "text-xs" : "text-sm"}>
              {result.matches.length === 0 ? "未发现相似内容" : "当前筛选下没有匹配"}
            </p>
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
            <Button size="sm" className="h-7 flex-1 text-xs bg-[#1a5632] hover:bg-[#144a2a]" onClick={onRewrite}>
              <Sparkles className="mr-1 h-3 w-3" />
              AI 降重
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
