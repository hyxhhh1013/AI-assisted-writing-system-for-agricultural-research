"use client";

import {
  ClipboardCheck, FolderOpen, Search, Shuffle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PlagiarismCheckResult } from "@/contracts/plagiarism";
import type { ReviewHistoryItem } from "@/contracts/review";
import type { QualitySection } from "@/lib/quality-sections";
import { totalWordCount } from "@/lib/quality-sections";
import { riskBadgeClass, riskLabel } from "@/components/shared/plagiarism/constants";
import { DetectionScopePanel } from "@/components/shared/quality/detection-scope";
import type { QualityStation } from "@/components/shared/quality/types";

interface ProjectOption {
  id: string;
  title: string;
}

interface QualityOverviewProps {
  projectTitle: string;
  sections: QualitySection[];
  result: PlagiarismCheckResult | null;
  lastReview: ReviewHistoryItem | null;
  webSearch: boolean;
  setWebSearch: (v: boolean) => void;
  plist: ProjectOption[];
  selPid: string;
  loadingP: boolean;
  onLoadProject: (id: string) => void;
  onOpenStation: (id: QualityStation) => void;
}

export function QualityOverview({
  projectTitle,
  sections,
  result,
  lastReview,
  webSearch,
  setWebSearch,
  plist,
  selPid,
  loadingP,
  onLoadProject,
  onOpenStation,
}: QualityOverviewProps) {
  const words = totalWordCount(sections);
  const pendingRewrite = result?.matches.filter((m) => m.riskLevel !== "low").length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 rounded-xl border border-[#1a5632]/10 bg-[#faf9f6] px-3 py-2.5">
        <FolderOpen className="h-4 w-4 shrink-0 text-[#1a5632]" />
        <select
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          value={selPid}
          onChange={(e) => onLoadProject(e.target.value)}
          disabled={loadingP}
        >
          <option value="">选择要检测的项目…</option>
          {plist.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
      </div>

      <div>
        <h2 className="text-base font-semibold text-[#122820]">
          {projectTitle || "提交前质量检查"}
        </h2>
        <p className="mt-0.5 text-xs text-[#6b7c72]">
          {sections.length > 0
            ? `${sections.length} 章 · ${words.toLocaleString()} 字 · 查重、降重、审查在同一工作台完成`
            : "先选择项目，系统会按章节加载正文"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => onOpenStation("check")}
          className="rounded-2xl border border-[#1a5632]/10 bg-white p-4 text-left shadow-sm transition-colors hover:border-[#1a5632]/25"
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-[#9aa8a0]">查重</p>
          {result ? (
            <>
              <p className={cn(
                "mt-1 text-2xl font-bold tabular-nums",
                result.overallRisk === "high" ? "text-red-600" : result.overallRisk === "medium" ? "text-amber-600" : "text-green-600",
              )}>
                {(result.maxSimilarity * 100).toFixed(1)}%
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Badge className={cn("h-5 px-1.5 text-[10px]", riskBadgeClass(result.overallRisk))}>
                  {riskLabel(result.overallRisk)}
                </Badge>
                <span className="text-[11px] text-[#6b7c72]">{result.totalMatches} 处匹配</span>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm font-medium text-[#122820]">尚未检测</p>
              <p className="mt-1 text-[11px] text-[#6b7c72]">自引 / 知识库 / 语义 / 可选联网</p>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => onOpenStation("review")}
          disabled={sections.length === 0}
          className="rounded-2xl border border-[#1a5632]/10 bg-white p-4 text-left shadow-sm transition-colors hover:border-[#1a5632]/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-[#9aa8a0]">审查</p>
          {lastReview ? (
            <>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#122820]">
                {lastReview.overallScore ?? "—"}
                <span className="ml-1 text-sm font-medium text-[#6b7c72]">分</span>
              </p>
              <p className="mt-2 text-[11px] text-[#6b7c72]">
                {lastReview.overallGrade ?? "—"} · 学术 / 论证 / 结构 / 诚信
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm font-medium text-[#122820]">尚未审查</p>
              <p className="mt-1 text-[11px] text-[#6b7c72]">四维度并行，最多两轮</p>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => result && pendingRewrite > 0 && onOpenStation("rewrite")}
          disabled={!result || pendingRewrite === 0}
          className="rounded-2xl border border-[#1a5632]/10 bg-white p-4 text-left shadow-sm transition-colors hover:border-[#1a5632]/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-[#9aa8a0]">待降重</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[#122820]">{pendingRewrite}</p>
          <p className="mt-2 text-[11px] text-[#6b7c72]">
            {pendingRewrite > 0 ? "中高风险匹配可生成改写" : "没有需要处理的段落"}
          </p>
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button className="bg-[#1a5632] hover:bg-[#144a2a]" onClick={() => onOpenStation("check")}>
          <Search className="mr-1.5 h-4 w-4" />
          {result ? "查看查重报告" : "开始查重"}
        </Button>
        <Button
          variant="outline"
          disabled={sections.length === 0}
          onClick={() => onOpenStation("review")}
        >
          <ClipboardCheck className="mr-1.5 h-4 w-4" />
          {lastReview ? "查看审查" : "开始审查"}
        </Button>
        {pendingRewrite > 0 && (
          <Button variant="outline" onClick={() => onOpenStation("rewrite")}>
            <Shuffle className="mr-1.5 h-4 w-4" />
            去降重
          </Button>
        )}
      </div>

      <DetectionScopePanel webSearch={webSearch} onToggleWeb={setWebSearch} />
    </div>
  );
}
