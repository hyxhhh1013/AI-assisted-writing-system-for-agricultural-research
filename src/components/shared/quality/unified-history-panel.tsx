"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, ClipboardCheck, Search } from "lucide-react";
import { toast } from "sonner";
import { listHistory, getCheckDetail, toCheckResult } from "@/services/plagiarism";
import { getHistory as getReviewHistory } from "@/services/review";
import type { PlagiarismCheckResult } from "@/contracts/plagiarism";
import type { ReviewHistoryItem } from "@/contracts/review";
import { riskDotClass } from "@/components/shared/plagiarism/constants";
import { ReviewHistoryList } from "@/components/shared/review/review-history-list";

interface UnifiedHistoryPanelProps {
  projectId?: string | null;
  onViewPlagiarism: (result: PlagiarismCheckResult) => void;
}

interface PlagiarismHistoryRow {
  id: string;
  title: string;
  maxSimilarity: number;
  createdAt: string;
  _count?: { matches: number };
}

export function UnifiedHistoryPanel({ projectId, onViewPlagiarism }: UnifiedHistoryPanelProps) {
  const [subTab, setSubTab] = useState<"plagiarism" | "review">("plagiarism");
  const [checks, setChecks] = useState<PlagiarismHistoryRow[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listHistory({ projectId: projectId || undefined }).then((rows) => setChecks(rows as PlagiarismHistoryRow[])).catch(() => setChecks([])),
      getReviewHistory(projectId || undefined).then((rows) => setReviewCount(rows.length)).catch(() => setReviewCount(0)),
    ]).finally(() => setLoading(false));
  }, [projectId]);

  const loadCheck = async (id: string) => {
    try {
      const detail = await getCheckDetail(id);
      onViewPlagiarism(toCheckResult(detail));
    } catch {
      toast.error("加载查重详情失败");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[360px] flex-col gap-3">
      <div className="flex shrink-0 gap-1 rounded-lg bg-muted/40 p-1">
        <button
          type="button"
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium ${subTab === "plagiarism" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          onClick={() => setSubTab("plagiarism")}
        >
          <Search className="h-3.5 w-3.5" />
          查重记录 ({checks.length})
        </button>
        <button
          type="button"
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium ${subTab === "review" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          onClick={() => setSubTab("review")}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          审查记录 ({reviewCount})
        </button>
      </div>

      {subTab === "plagiarism" ? (
        checks.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <Clock className="mb-2 h-8 w-8 opacity-30" />
            <p className="text-sm">暂无查重记录</p>
          </div>
        ) : (
          <div className="space-y-2 overflow-y-auto">
            {checks.map((c) => {
              const risk = c.maxSimilarity > 0.35 ? "high" : c.maxSimilarity > 0.15 ? "medium" : "low";
              return (
                <button
                  key={c.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/30"
                  onClick={() => loadCheck(c.id)}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${riskDotClass(risk)}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleString("zh-CN")}</p>
                  </div>
                  <Badge variant="outline" className="text-xs tabular-nums">{(c.maxSimilarity * 100).toFixed(1)}%</Badge>
                  <span className="text-xs text-muted-foreground">{c._count?.matches ?? 0} 处</span>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border">
          <ReviewHistoryList projectId={projectId} className="h-full" />
        </div>
      )}
    </div>
  );
}
