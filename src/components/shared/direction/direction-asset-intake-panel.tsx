"use client";

import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  ArrowRight,
  Search,
  Link2,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { siteTheme } from "@/lib/site-theme";
import type { DirectionAsset, DirectionAnalysis } from "@/contracts/direction";
import type { DirectionLiteratureState } from "@/contracts/direction-literature";
import {
  computeAssetInventoryHealth,
  type AssetInventoryCheck,
  type CheckSeverity,
} from "@/lib/direction-asset-health";

interface DirectionAssetIntakePanelProps {
  assets: DirectionAsset[];
  analysis?: DirectionAnalysis | null;
  literatureCorpus?: DirectionLiteratureState | null;
  literatureCount?: number;
  pendingScanCount?: number | null;
  onScan?: () => void;
  onAddExperiment?: () => void;
  onProceed?: () => void;
}

function severityIcon(passed: boolean, severity: CheckSeverity) {
  if (passed) {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#059669]" />;
  }
  if (severity === "high") {
    return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#dc2626]" />;
  }
  return <Circle className="h-3.5 w-3.5 shrink-0 text-[#d97706]" />;
}

function CheckRow({ check }: { check: AssetInventoryCheck }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md px-2 py-1.5 text-xs",
        check.passed ? "text-[#3d4f46]" : "text-[#122820]",
      )}
    >
      {severityIcon(check.passed, check.severity)}
      <div className="min-w-0 flex-1">
        <span className={cn("font-medium", !check.passed && check.severity === "high" && "text-[#dc2626]")}>
          {check.label}
        </span>
        <p className="mt-0.5 text-[10px] leading-relaxed text-[#9aa8a0]">{check.hint}</p>
      </div>
    </div>
  );
}

function CompletenessRing({ score }: { score: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 80 ? "#059669" : score >= 50 ? "#d97706" : "#dc2626";

  return (
    <div className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center">
      <svg className="h-[72px] w-[72px] -rotate-90" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="#1a5632" strokeOpacity={0.08} strokeWidth="6" />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold tabular-nums text-[#122820]">{score}</span>
        <span className="text-[9px] text-[#9aa8a0]">完整度</span>
      </div>
    </div>
  );
}

export function DirectionAssetIntakePanel({
  assets,
  analysis,
  literatureCorpus,
  literatureCount = 0,
  pendingScanCount,
  onScan,
  onAddExperiment,
  onProceed,
}: DirectionAssetIntakePanelProps) {
  const health = computeAssetInventoryHealth(assets, analysis, literatureCorpus);
  const { stats, checks, readyForNextPhase, completenessScore } = health;

  const blockingChecks = checks.filter((c) => !c.passed && c.severity === "high");
  const advisoryChecks = checks.filter((c) => !c.passed && c.severity !== "high");

  return (
    <div className={cn("rounded-xl border border-[#1a5632]/10 p-5", siteTheme.card)}>
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <CompletenessRing score={completenessScore} />
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[#122820]">
              <ClipboardList className="h-4 w-4 text-[#1a5632]" />
              资产盘点进度
            </h3>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-[#6b7c72]">
              结构化盘点实验、已发表论文与数据集，为后续预承诺与 8 维度分析提供证据基础。
              {literatureCount > 0 && (
                <span className="ml-1 text-[#6366f1]">
                  知识库已有 {literatureCount} 篇相关文献。
                </span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="h-5 border-0 bg-[#2563eb]/8 text-[10px] text-[#2563eb]">
                实验 {stats.experiments}
              </Badge>
              <Badge variant="secondary" className="h-5 border-0 bg-[#1a5632]/8 text-[10px] text-[#1a5632]">
                论文 {stats.papers}
              </Badge>
              <Badge variant="secondary" className="h-5 border-0 bg-[#b8975a]/8 text-[10px] text-[#b8975a]">
                数据集 {stats.datasets}
              </Badge>
              {stats.linkedExperiments > 0 && (
                <Badge variant="secondary" className="h-5 gap-0.5 border-0 bg-black/[0.04] text-[10px] text-[#6b7c72]">
                  <Link2 className="h-2.5 w-2.5" />
                  {stats.linkedExperiments} 项已关联
                </Badge>
              )}
              {stats.incompleteAssets > 0 && (
                <Badge variant="secondary" className="h-5 border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                  {stats.incompleteAssets} 项待补全
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
          {pendingScanCount != null && pendingScanCount > 0 && onScan && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onScan}>
              <Search className="h-3.5 w-3.5" />
              扫描 {pendingScanCount} 项待导入
            </Button>
          )}
          {stats.experiments === 0 && onAddExperiment && (
            <Button size="sm" className={cn("gap-1.5 text-xs", siteTheme.btnPrimary)} onClick={onAddExperiment}>
              录入首个实验
            </Button>
          )}
          {readyForNextPhase && onProceed && (
            <Button size="sm" className={cn("gap-1.5 text-xs", siteTheme.btnPrimary)} onClick={onProceed}>
              进入预承诺
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-[#1a5632]/8 bg-[#f6f5f1]/40 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#9aa8a0]">
            必达项
          </p>
          <div className="space-y-0.5">
            {checks
              .filter((c) => c.severity === "high")
              .map((c) => (
                <CheckRow key={c.id} check={c} />
              ))}
          </div>
        </div>
        <div className="rounded-lg border border-[#1a5632]/8 bg-white p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#9aa8a0]">
            建议项
          </p>
          <div className="space-y-0.5">
            {checks
              .filter((c) => c.severity !== "high")
              .map((c) => (
                <CheckRow key={c.id} check={c} />
              ))}
          </div>
        </div>
      </div>

      {!readyForNextPhase && blockingChecks.length > 0 && (
        <div className="mt-3 rounded-lg border border-[#dc2626]/15 bg-[#dc2626]/4 px-3 py-2 text-xs text-[#991b1b]">
          还需完成：{blockingChecks.map((c) => c.label).join("、")}
        </div>
      )}

      {readyForNextPhase && advisoryChecks.length > 0 && (
        <div className="mt-3 rounded-lg border border-[#d97706]/20 bg-[#d97706]/5 px-3 py-2 text-xs text-[#92400e]">
          可进入下一阶段；建议完善：{advisoryChecks.map((c) => c.label).join("、")}
        </div>
      )}
    </div>
  );
}
