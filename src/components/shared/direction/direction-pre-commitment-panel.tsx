"use client";

import {
  ClipboardCheck,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Shield,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { siteTheme } from "@/lib/site-theme";
import type { DirectionAsset, DirectionAnalysis } from "@/contracts/direction";
import {
  computePreCommitmentReadiness,
  ANALYSIS_DIMENSIONS,
  type PreCommitmentCheck,
} from "@/lib/direction-pre-commitment";

interface DirectionPreCommitmentPanelProps {
  assets: DirectionAsset[];
  analysis?: DirectionAnalysis | null;
  onJumpToAssets?: () => void;
  onJumpToAnalysis?: () => void;
}

function CheckIcon({ check }: { check: PreCommitmentCheck }) {
  if (check.passed) return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#059669]" />;
  if (check.severity === "high") return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#dc2626]" />;
  return <Circle className="h-3.5 w-3.5 shrink-0 text-[#d97706]" />;
}

export function DirectionPreCommitmentPanel({
  assets,
  analysis,
  onJumpToAssets,
  onJumpToAnalysis,
}: DirectionPreCommitmentPanelProps) {
  const readiness = computePreCommitmentReadiness(assets, analysis);

  return (
    <div className="rounded-xl border border-[#1a5632]/10 bg-white p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[#122820]">
            <ClipboardCheck className="h-4 w-4 text-[#1a5632]" />
            Phase 1 — 预承诺（Paper-Blind）
          </h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-[#6b7c72]">
            对齐 academic-paper 预承诺协议：在<strong className="font-medium text-[#122820]">不读取资产内容</strong>的前提下，
            通过 Socratic 问答 → 你亲自复述验收标准 → AI 生成 8 维 Scoring Plan → 你确认后，分析阶段才按此标准评分。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#2563eb]/15 bg-[#2563eb]/5 px-2.5 py-1.5 text-[10px] text-[#2563eb]">
          <Shield className="h-3.5 w-3.5" />
          Iron Rule：制定标准时 AI 不可见资产
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-1 sm:grid-cols-4">
        {ANALYSIS_DIMENSIONS.map((d) => (
          <div
            key={d.id}
            className="rounded-md border border-[#1a5632]/6 bg-[#f6f5f1]/40 px-2 py-1.5"
          >
            <span className="text-[10px] font-bold text-[#1a5632]">{d.id}</span>
            <p className="text-[9px] text-[#9aa8a0] truncate">{d.name}</p>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        {readiness.checks.map((check) => (
          <div key={check.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs">
            <CheckIcon check={check} />
            <div>
              <span className={cn("font-medium", !check.passed && check.severity === "high" && "text-[#dc2626]")}>
                {check.label}
              </span>
              <p className="text-[10px] text-[#9aa8a0]">{check.hint}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!readiness.ready && !readiness.hasConfirmedContract && onJumpToAssets && (
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={onJumpToAssets}>
            返回文献备料
          </Button>
        )}
        {readiness.ready && onJumpToAnalysis && (
          <Button size="sm" className={cn("gap-1 text-xs", siteTheme.btnPrimary)} onClick={onJumpToAnalysis}>
            启动 8 维度分析
            <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
