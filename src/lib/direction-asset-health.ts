/**
 * 方向资产盘点健康度与完整度评估（客户端安全，无 Prisma 依赖）
 *
 * 借鉴 academic-paper Phase 0 配置访谈：将「录入完成」量化为可操作的检查清单。
 */

import type {
  DirectionAsset,
  DirectionAnalysis,
  ExperimentAsset,
  PaperAsset,
  DatasetAsset,
} from "@/contracts/direction";
import type { DirectionLiteratureState } from "@/contracts/direction-literature";
import {
  MIN_REVIEW_CORPUS_ENTRIES,
  countCoreLiterature,
} from "@/contracts/direction-literature";
import { isAnalysisFingerprintStale } from "@/lib/direction-analysis-fingerprint";

export type CheckSeverity = "high" | "medium" | "low";

export interface AssetInventoryCheck {
  id: string;
  label: string;
  passed: boolean;
  severity: CheckSeverity;
  hint: string;
}

export interface AssetInventoryStats {
  total: number;
  experiments: number;
  papers: number;
  datasets: number;
  negativeResults: number;
  linkedExperiments: number;
  incompleteAssets: number;
  orphanAssets: number;
}

export interface AssetInventoryHealth {
  completenessScore: number;
  checks: AssetInventoryCheck[];
  readyForNextPhase: boolean;
  stats: AssetInventoryStats;
}

const EXPERIMENT_REQUIRED: Array<keyof ExperimentAsset> = [
  "title",
  "researchQuestion",
  "keyFindings",
  "limitations",
];

const PAPER_REQUIRED: Array<keyof PaperAsset> = ["doi", "contribution"];
const DATASET_REQUIRED: Array<keyof DatasetAsset> = ["title", "variables"];

function isFilled(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return value > 0;
  return value != null;
}

/** 单项资产字段完整度 0–100 */
export function computeAssetFieldCompleteness(asset: DirectionAsset): number {
  if (asset.kind === "experiment") {
    const fields = [
      asset.title,
      asset.researchQuestion,
      asset.methods,
      asset.keyFindings,
      asset.limitations,
      asset.dateRange,
    ];
    const filled = fields.filter(isFilled).length;
    return Math.round((filled / fields.length) * 100);
  }
  if (asset.kind === "paper") {
    const fields = [asset.doi, asset.title, asset.journal, asset.contribution, asset.abstract];
    const filled = fields.filter(isFilled).length;
    return Math.round((filled / fields.length) * 100);
  }
  const fields = [asset.title, asset.variables, asset.sampleSize, asset.filePath];
  const filled = fields.filter(isFilled).length;
  return Math.round((filled / fields.length) * 100);
}

export function isAssetStructurallyComplete(asset: DirectionAsset): boolean {
  if (asset.kind === "experiment") {
    return EXPERIMENT_REQUIRED.every((k) => isFilled(asset[k]));
  }
  if (asset.kind === "paper") {
    return PAPER_REQUIRED.every((k) => isFilled(asset[k]));
  }
  return DATASET_REQUIRED.every((k) => isFilled(asset[k]));
}

function countLinkedExperiments(assets: DirectionAsset[]): number {
  const experimentIds = new Set(
    assets.filter((a) => a.kind === "experiment").map((a) => a.id),
  );
  let linked = 0;
  for (const a of assets) {
    if (a.kind === "experiment") {
      const hasLink =
        (a.linkedPapers?.length ?? 0) > 0 || (a.linkedDatasets?.length ?? 0) > 0;
      if (hasLink) linked += 1;
      continue;
    }
    const refs = a.kind === "paper" ? a.linkedExperiments : a.linkedExperiments;
    if (refs?.some((id) => experimentIds.has(id))) linked += 0; // counted via experiment side
  }
  for (const exp of assets.filter((a) => a.kind === "experiment")) {
    const e = exp as ExperimentAsset;
    const hasLink =
      (e.linkedPapers?.length ?? 0) > 0 ||
      (e.linkedDatasets?.length ?? 0) > 0 ||
      assets.some(
        (a) =>
          (a.kind === "paper" || a.kind === "dataset") &&
          a.linkedExperiments?.includes(e.id),
      );
    if (hasLink) linked += 1;
  }
  return linked;
}

function countOrphanAssets(assets: DirectionAsset[]): number {
  const experimentIds = new Set(
    assets.filter((a) => a.kind === "experiment").map((a) => a.id),
  );
  let orphans = 0;
  for (const a of assets) {
    if (a.kind === "experiment") {
      const e = a as ExperimentAsset;
      const linked =
        (e.linkedPapers?.length ?? 0) > 0 ||
        (e.linkedDatasets?.length ?? 0) > 0 ||
        assets.some(
          (x) =>
            (x.kind === "paper" || x.kind === "dataset") &&
            x.linkedExperiments?.includes(e.id),
        );
      if (!linked && assets.length > 1) orphans += 1;
    } else {
      const refs = a.linkedExperiments ?? [];
      if (refs.length === 0 && experimentIds.size > 0) orphans += 1;
    }
  }
  return orphans;
}

/**
 * 资产盘点整体健康度（Phase 0 门禁）
 */
export function computeAssetInventoryHealth(
  assets: DirectionAsset[],
  analysis?: DirectionAnalysis | null,
  literature?: DirectionLiteratureState | null,
): AssetInventoryHealth {
  const experiments = assets.filter((a) => a.kind === "experiment");
  const papers = assets.filter((a) => a.kind === "paper");
  const datasets = assets.filter((a) => a.kind === "dataset");
  const negativeResults = experiments.filter(
    (a) => (a as ExperimentAsset).isNegativeResult,
  ).length;
  const incompleteAssets = assets.filter((a) => !isAssetStructurallyComplete(a)).length;
  const linkedExperiments = countLinkedExperiments(assets);
  const orphanAssets = assets.length > 1 ? countOrphanAssets(assets) : 0;

  const expWithRQ = experiments.filter((a) =>
    isFilled((a as ExperimentAsset).researchQuestion),
  ).length;
  const papersWithContribution = papers.filter((a) =>
    isFilled((a as PaperAsset).contribution),
  ).length;

  const litState = literature ?? { entries: [] };
  const litCount = litState.entries.length;
  const litConfirmed = Boolean(litState.confirmedAt);
  const coreLit = countCoreLiterature(litState);
  const reviewReady =
    litConfirmed && litCount >= MIN_REVIEW_CORPUS_ENTRIES;
  const researchReady = experiments.length >= 1;

  const checks: AssetInventoryCheck[] = [
    {
      id: "min_assets",
      label: "至少 3 项资产或文献",
      passed: assets.length + litCount >= 3,
      severity: "high",
      hint:
        assets.length + litCount >= 3
          ? `已录入 ${assets.length} 项资产 + ${litCount} 篇文献`
          : `当前 ${assets.length} 项资产、${litCount} 篇文献，合计需 ≥3`,
    },
    {
      id: "research_or_review_path",
      label: "完成研究链或综述文献 corpus",
      passed: researchReady || reviewReady,
      severity: "high",
      hint: researchReady
        ? `${experiments.length} 个实验已录入（研究型路径）`
        : reviewReady
          ? `文献 corpus 已确认（${litCount} 篇，核心 ${coreLit} 篇）`
          : "研究型：录入 ≥1 实验；综述型：在下方确认 ≥3 篇文献 corpus",
    },
    {
      id: "min_experiment",
      label: "实验资产（研究型建议）",
      passed: experiments.length >= 1 || reviewReady,
      severity: "medium",
      hint:
        experiments.length >= 1
          ? `${experiments.length} 个实验已录入`
          : reviewReady
            ? "综述路径已满足，实验可选"
            : "原创研究请先录入实验；纯综述可跳过",
    },
    {
      id: "experiment_rq",
      label: "实验均填写研究问题",
      passed: experiments.length === 0 || expWithRQ === experiments.length,
      severity: "high",
      hint:
        experiments.length === 0
          ? "暂无实验"
          : expWithRQ === experiments.length
            ? "所有实验均有明确研究问题"
            : `${experiments.length - expWithRQ} 个实验缺少研究问题`,
    },
    {
      id: "paper_contribution",
      label: "论文均标注学术贡献",
      passed: papers.length === 0 || papersWithContribution === papers.length,
      severity: "medium",
      hint:
        papers.length === 0
          ? "暂无已发表论文（可稍后补充）"
          : papersWithContribution === papers.length
            ? "所有论文均已标注对本方向的贡献"
            : `${papers.length - papersWithContribution} 篇论文缺少贡献说明`,
    },
    {
      id: "field_complete",
      label: "必填字段完整",
      passed: incompleteAssets === 0,
      severity: "medium",
      hint:
        incompleteAssets === 0
          ? "所有资产必填字段已填写"
          : `${incompleteAssets} 项资产仍有必填字段未填`,
    },
    {
      id: "asset_links",
      label: "实验与论文/数据集建立关联",
      passed:
        assets.length <= 1 ||
        (experiments.length > 0 && linkedExperiments >= Math.min(experiments.length, 1)),
      severity: "low",
      hint:
        assets.length <= 1
          ? "录入更多资产后建议建立关联"
          : linkedExperiments > 0
            ? `${linkedExperiments}/${experiments.length} 个实验已关联论文或数据集`
            : "关联有助于后续 8 维度分析识别数据支撑链",
    },
    {
      id: "negative_results",
      label: "记录负结果实验（建议）",
      passed: negativeResults > 0 || experiments.length === 0,
      severity: "low",
      hint:
        negativeResults > 0
          ? `已记录 ${negativeResults} 个负结果，避免重复路径`
          : experiments.length > 0
            ? "建议标注失败或未达预期的实验"
            : "暂无实验",
    },
  ];

  if (analysis) {
    const stale = isAnalysisFingerprintStale(assets, analysis);
    checks.push({
      id: "analysis_fresh",
      label: "分析结果与当前资产同步",
      passed: !stale,
      severity: "medium",
      hint: stale
        ? "资产已变更，建议重新运行 8 维度分析"
        : "分析基于当前资产快照",
    });
  }

  const highChecks = checks.filter((c) => c.severity === "high");
  const readyForNextPhase = highChecks.every((c) => c.passed);

  const passedWeight = checks.reduce((sum, c) => {
    const w = c.severity === "high" ? 3 : c.severity === "medium" ? 2 : 1;
    return sum + (c.passed ? w : 0);
  }, 0);
  const totalWeight = checks.reduce((sum, c) => {
    const w = c.severity === "high" ? 3 : c.severity === "medium" ? 2 : 1;
    return sum + w;
  }, 0);
  const completenessScore =
    totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 0;

  return {
    completenessScore,
    checks,
    readyForNextPhase,
    stats: {
      total: assets.length,
      experiments: experiments.length,
      papers: papers.length,
      datasets: datasets.length,
      negativeResults,
      linkedExperiments,
      incompleteAssets,
      orphanAssets,
    },
  };
}

/** 扫描候选与已录入资产去重（按 DOI 或标题） */
export function isAssetAlreadyImported(
  candidate: { doi?: string; title?: string },
  existing: DirectionAsset[],
): boolean {
  const normTitle = (candidate.title || "").trim().toLowerCase();
  const normDoi = (candidate.doi || "").trim().toLowerCase();

  for (const a of existing) {
    if (a.kind !== "paper") continue;
    const p = a as PaperAsset;
    if (normDoi && p.doi.trim().toLowerCase() === normDoi) return true;
    if (normTitle && p.title.trim().toLowerCase() === normTitle) return true;
  }
  return false;
}
