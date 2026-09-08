"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, ExternalLink, Search } from "lucide-react";
import { getHistory as getReviewHistory } from "@/services/review";
import { listHistory } from "@/services/plagiarism";
import { cn } from "@/lib/utils";
import { riskBadgeClass, riskLabel } from "@/components/shared/plagiarism/constants";

interface QualityHubCardProps {
  projectId?: string;
  projectTitle?: string;
}

interface LatestCheck {
  maxSimilarity: number;
  overallRisk: string;
  matchCount: number;
}

export function QualityHubCard({ projectId, projectTitle }: QualityHubCardProps) {
  const router = useRouter();
  const [check, setCheck] = useState<LatestCheck | null>(null);
  const [reviewScore, setReviewScore] = useState<number | null>(null);

  useEffect(() => {
    if (!projectId) {
      setCheck(null);
      setReviewScore(null);
      return;
    }
    let cancelled = false;
    listHistory({ projectId, limit: 1 })
      .then((rows) => {
        if (cancelled || !rows[0]) return;
        const row = rows[0];
        setCheck({
          maxSimilarity: row.maxSimilarity,
          overallRisk: row.overallRisk,
          matchCount: row._count?.matches ?? 0,
        });
      })
      .catch(() => {
        if (!cancelled) setCheck(null);
      });
    getReviewHistory(projectId)
      .then((rows) => {
        if (!cancelled) setReviewScore(rows[0]?.overallScore ?? null);
      })
      .catch(() => {
        if (!cancelled) setReviewScore(null);
      });
    return () => { cancelled = true; };
  }, [projectId]);

  const href = projectId
    ? `/plagiarism?id=${encodeURIComponent(projectId)}`
    : "/plagiarism";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-1">
      <div>
        <h2 className="text-sm font-semibold text-[#122820]">论文质量</h2>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[#6b7c72]">
          {projectTitle ? `「${projectTitle}」` : "当前项目"}的查重、降重与四维审查在独立工作台完成，避免挤在侧栏。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-[#1a5632]/10 bg-[#faf9f6] p-3">
          <p className="flex items-center gap-1 text-[10px] text-[#9aa8a0]">
            <Search className="h-3 w-3" /> 最近查重
          </p>
          {check ? (
            <>
              <p className="mt-1 text-lg font-bold tabular-nums text-[#122820]">
                {(check.maxSimilarity * 100).toFixed(1)}%
              </p>
              <span className={cn("mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px]", riskBadgeClass(check.overallRisk))}>
                {riskLabel(check.overallRisk)} · {check.matchCount} 处
              </span>
            </>
          ) : (
            <p className="mt-2 text-xs text-[#6b7c72]">尚未检测</p>
          )}
        </div>
        <div className="rounded-xl border border-[#1a5632]/10 bg-[#faf9f6] p-3">
          <p className="flex items-center gap-1 text-[10px] text-[#9aa8a0]">
            <ClipboardCheck className="h-3 w-3" /> 最近审查
          </p>
          {reviewScore != null ? (
            <p className="mt-1 text-lg font-bold tabular-nums text-[#122820]">
              {reviewScore}<span className="ml-0.5 text-xs font-medium text-[#6b7c72]">分</span>
            </p>
          ) : (
            <p className="mt-2 text-xs text-[#6b7c72]">尚未审查</p>
          )}
        </div>
      </div>

      <Button className="w-full bg-[#1a5632] hover:bg-[#144a2a]" onClick={() => router.push(href)}>
        <ExternalLink className="mr-1.5 h-4 w-4" />
        打开质量中心
      </Button>
    </div>
  );
}
