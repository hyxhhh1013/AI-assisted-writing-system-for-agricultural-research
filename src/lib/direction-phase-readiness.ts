/**
 * 方向工作流 Phase 2–4 就绪检查
 */

import type {
  DirectionAsset,
  DirectionAnalysis,
  DirectionRoadmap,
} from "@/contracts/direction";
import { computePreCommitmentReadiness } from "@/lib/direction-pre-commitment";
import { isAnalysisFingerprintStale } from "@/lib/direction-analysis-fingerprint";

export interface PhaseCheck {
  id: string;
  label: string;
  passed: boolean;
  severity: "high" | "medium" | "low";
  hint: string;
}

export interface PhaseReadiness {
  ready: boolean;
  checks: PhaseCheck[];
}

export function computeAnalysisReadiness(
  assets: DirectionAsset[],
  analysis?: DirectionAnalysis | null,
): PhaseReadiness {
  const pre = computePreCommitmentReadiness(assets, analysis);
  const hasDimensions = (analysis?.dimensions?.length ?? 0) >= 8;
  const stale = isAnalysisFingerprintStale(assets, analysis);

  const checks: PhaseCheck[] = [
    {
      id: "contract",
      label: "预承诺评价标准已确认",
      passed: pre.hasConfirmedContract && !pre.contractStale,
      severity: "high",
      hint: pre.contractStale
        ? "方向快照或标准已变更，请重新确认预承诺"
        : pre.hasConfirmedContract
          ? "可按 Rubrics 启动 paper-visible 分析"
          : "请先完成 Phase 1 预承诺",
    },
    {
      id: "analysis_done",
      label: "8 维度分析已完成",
      passed: hasDimensions,
      severity: "medium",
      hint: hasDimensions ? "可进入论文路线图" : "点击「开始分析」运行完整管道",
    },
    {
      id: "analysis_fresh",
      label: "分析结果与当前快照同步",
      passed: !hasDimensions || !stale,
      severity: "medium",
      hint: stale ? "方向快照或评价标准已变更，建议重新分析" : "分析基于当前快照",
    },
  ];

  return {
    ready: pre.hasConfirmedContract && !pre.contractStale,
    checks,
  };
}

export function computeRoadmapReadiness(
  assets: DirectionAsset[],
  analysis?: DirectionAnalysis | null,
  roadmap?: DirectionRoadmap | null,
): PhaseReadiness {
  const hasAnalysis = (analysis?.dimensions?.length ?? 0) >= 8;
  const hasCandidates = (analysis?.paperCandidates?.length ?? 0) > 0;
  const roadmapStale =
    !!roadmap &&
    !!analysis?.generatedAt &&
    roadmap.analysisSnapshotId !== analysis.generatedAt;
  const confirmed = !!roadmap?.confirmedAt;

  const checks: PhaseCheck[] = [
    {
      id: "analysis",
      label: "8 维度分析已完成",
      passed: hasAnalysis,
      severity: "high",
      hint: hasAnalysis ? "分析结果将作为路线图输入" : "请先完成 Phase 2 分析",
    },
    {
      id: "candidates",
      label: "已识别论文候选（D5）",
      passed: hasCandidates,
      severity: "medium",
      hint: hasCandidates
        ? `${analysis!.paperCandidates!.length} 篇候选待排序`
        : "分析未产出论文候选，路线图将基于维度摘要生成",
    },
    {
      id: "roadmap_generated",
      label: "论文路线图已生成",
      passed: !!roadmap?.papers?.length,
      severity: "medium",
      hint: roadmap?.papers?.length
        ? `${roadmap.papers.length} 篇论文已排期`
        : "点击生成路线图",
    },
    {
      id: "roadmap_confirmed",
      label: "路线图已人工确认",
      passed: confirmed,
      severity: "medium",
      hint: confirmed ? "可安全进入写作与申报" : "审阅优先级与时间线后点击确认",
    },
    {
      id: "roadmap_fresh",
      label: "路线图与当前分析同步",
      passed: !roadmap || !roadmapStale,
      severity: "low",
      hint: roadmapStale ? "分析已更新，建议重新生成并确认路线图" : "路线图基于最新分析",
    },
  ];

  return {
    ready: hasAnalysis && !!roadmap?.papers?.length && confirmed && !roadmapStale,
    checks,
  };
}

export function computeGrantReadiness(
  assets: DirectionAsset[],
  analysis?: DirectionAnalysis | null,
  roadmap?: DirectionRoadmap | null,
): PhaseReadiness {
  const hasAnalysis = (analysis?.dimensions?.length ?? 0) >= 8;
  const roadmapReady = computeRoadmapReadiness(assets, analysis, roadmap);

  const checks: PhaseCheck[] = [
    {
      id: "analysis",
      label: "8 维度分析已完成",
      passed: hasAnalysis,
      severity: "high",
      hint: hasAnalysis ? "立项依据与创新点将引用 D1/D3/D7" : "请先完成分析",
    },
    {
      id: "roadmap",
      label: "论文路线图已确认",
      passed: roadmapReady.checks.find((c) => c.id === "roadmap_confirmed")?.passed ?? false,
      severity: "medium",
      hint: "预期成果章节将引用路线图排期",
    },
  ];

  return {
    ready: hasAnalysis,
    checks,
  };
}
