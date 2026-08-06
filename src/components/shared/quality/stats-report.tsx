"use client";

import type { PlagiarismCheckStats, PlagiarismMatchType } from "@/contracts/plagiarism";
import { MATCH_ICONS } from "@/components/shared/plagiarism/constants";

const STAT_KEYS: { key: keyof PlagiarismCheckStats; matchType: PlagiarismMatchType; label: string }[] = [
  { key: "selfMatches", matchType: "self", label: "自引重复" },
  { key: "crossMatches", matchType: "cross", label: "跨项目" },
  { key: "knowledgeMatches", matchType: "local", label: "文献库" },
  { key: "embeddingMatches", matchType: "local", label: "语义相似" },
  { key: "webMatches", matchType: "web", label: "联网" },
  { key: "clicheMatches", matchType: "ai", label: "套话/风格" },
  { key: "aiMatches", matchType: "ai", label: "AI 评估" },
];

interface PlagiarismStatsReportProps {
  stats: PlagiarismCheckStats;
  compact?: boolean;
}

export function PlagiarismStatsReport({ stats, compact = false }: PlagiarismStatsReportProps) {
  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className={compact ? "flex flex-wrap gap-2 text-[10px] text-muted-foreground" : "flex flex-wrap gap-3 text-xs text-muted-foreground"}>
        <span>段落 {stats.sampledParagraphs}/{stats.totalParagraphs}（采样）</span>
        <span>耗时 {(stats.processingTime / 1000).toFixed(1)}s</span>
      </div>
      <div className={compact ? "grid grid-cols-2 gap-1.5 sm:grid-cols-4" : "grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"}>
        {STAT_KEYS.map(({ key, matchType, label }) => {
          const count = stats[key] as number;
          if (key === "totalParagraphs" || key === "sampledParagraphs" || key === "processingTime") return null;
          return (
            <div
              key={key}
              className={compact ? "rounded-md border bg-muted/20 px-2 py-1.5 text-center" : "rounded-lg border bg-muted/20 px-3 py-2 text-center"}
            >
              <span className="text-sm">{MATCH_ICONS[matchType]}</span>
              <p className={compact ? "mt-0.5 text-sm font-bold tabular-nums text-[#122820]" : "mt-1 text-lg font-bold tabular-nums text-[#122820]"}>
                {count}
              </p>
              <p className={compact ? "text-[9px] text-muted-foreground" : "text-[10px] text-muted-foreground"}>{label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
