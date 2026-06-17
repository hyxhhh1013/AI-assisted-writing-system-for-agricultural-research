"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search, Shuffle, ClipboardCheck, ArrowRight, AlertTriangle, CheckCircle2, FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlagiarismCheckResult } from "@/contracts/plagiarism";
import type { ReviewHistoryItem } from "@/contracts/review";
import { riskBadgeClass, riskLabel } from "@/components/shared/plagiarism/constants";
import { DetectionScopePanel } from "./detection-scope";
import type { QualitySection } from "@/lib/quality-sections";

export type QualityTab = "overview" | "check" | "result" | "rewrite" | "review" | "history";

interface OverviewPanelProps {
  projectTitle?: string;
  hasProject: boolean;
  sections: QualitySection[];
  checkResult: PlagiarismCheckResult | null;
  lastReview: ReviewHistoryItem | null;
  webSearch: boolean;
  onNavigate: (tab: QualityTab) => void;
  onSelectProject: () => void;
}

export function OverviewPanel({
  projectTitle,
  hasProject,
  sections,
  checkResult,
  lastReview,
  webSearch,
  onNavigate,
  onSelectProject,
}: OverviewPanelProps) {
  const highMatches = checkResult?.matches.filter((m) => m.riskLevel !== "low").length ?? 0;

  const steps = [
    {
      id: "check" as const,
      icon: Search,
      title: "1. 查重检测",
      desc: hasProject ? "按章节或全文，多源比对" : "请先绑定项目或粘贴正文",
      status: checkResult ? (checkResult.overallRisk === "low" ? "done" : "warn") : "pending",
      action: "开始查重",
    },
    {
      id: "rewrite" as const,
      icon: Shuffle,
      title: "2. AI 降重",
      desc: highMatches > 0 ? `${highMatches} 处建议改写` : "查重完成后可用",
      status: !checkResult ? "pending" : highMatches > 0 ? "warn" : "done",
      action: "去降重",
      disabled: !checkResult || highMatches === 0,
    },
    {
      id: "review" as const,
      icon: ClipboardCheck,
      title: "3. 论文审查",
      desc: lastReview ? `最近 ${lastReview.overallGrade ?? "—"} 级 · ${lastReview.overallScore ?? "—"} 分` : "四维度规范与论证审查",
      status: lastReview ? "done" : hasProject ? "pending" : "pending",
      action: "执行审查",
      disabled: !hasProject,
    },
  ];

  return (
    <div className="space-y-6">
      {/* 项目状态 */}
      <div className="rounded-2xl border border-[#1a5632]/12 bg-gradient-to-br from-white to-[#f6f5f1] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#1a5632]/70">提交前质量检查</p>
            <h2 className="mt-1 text-lg font-semibold text-[#122820] sm:text-xl">
              {hasProject ? projectTitle || "未命名论文" : "尚未绑定项目"}
            </h2>
            <p className="mt-1 text-xs text-[#6b7c72]">
              {hasProject
                ? `${sections.length} 个章节可用于查重与审查`
                : "从项目导入可自动加载 IMRAD 章节，审查与按章查重需绑定项目"}
            </p>
          </div>
          {!hasProject && (
            <Button onClick={onSelectProject} className="shrink-0 bg-[#1a5632] hover:bg-[#144a2a]">
              <FolderOpen className="mr-2 h-4 w-4" />
              选择项目
            </Button>
          )}
        </div>

        {checkResult && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#1a5632]/10 bg-white/80 px-4 py-3">
            <span className="text-2xl font-bold tabular-nums text-[#122820]">
              {(checkResult.maxSimilarity * 100).toFixed(1)}%
            </span>
            <Badge className={cn("text-[10px]", riskBadgeClass(checkResult.overallRisk))}>
              {riskLabel(checkResult.overallRisk)}
            </Badge>
            <span className="text-xs text-[#6b7c72]">{checkResult.totalMatches} 处匹配</span>
            <Button variant="ghost" size="sm" className="ml-auto h-8 text-xs" onClick={() => onNavigate("result")}>
              查看报告
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* 工作流 */}
      <div className="grid gap-3 sm:grid-cols-3">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.id}
              className={cn(
                "relative flex flex-col rounded-xl border bg-white p-4 transition-shadow hover:shadow-md",
                step.status === "warn" ? "border-amber-200" : "border-[#1a5632]/10",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg",
                  step.status === "done" ? "bg-green-50 text-green-700" : step.status === "warn" ? "bg-amber-50 text-amber-700" : "bg-[#1a5632]/8 text-[#1a5632]",
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                {step.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                {step.status === "warn" && <AlertTriangle className="h-4 w-4 text-amber-600" />}
              </div>
              <h3 className="mt-3 text-sm font-semibold text-[#122820]">{step.title}</h3>
              <p className="mt-1 flex-1 text-[11px] leading-relaxed text-[#6b7c72]">{step.desc}</p>
              <Button
                size="sm"
                variant={step.disabled ? "outline" : "default"}
                className={cn("mt-3 h-8 w-full text-xs", !step.disabled && "bg-[#1a5632] hover:bg-[#144a2a]")}
                disabled={step.disabled}
                onClick={() => onNavigate(step.id === "check" ? (checkResult ? "result" : "check") : step.id)}
              >
                {step.action}
              </Button>
            </div>
          );
        })}
      </div>

      <DetectionScopePanel webSearch={webSearch} />
    </div>
  );
}
