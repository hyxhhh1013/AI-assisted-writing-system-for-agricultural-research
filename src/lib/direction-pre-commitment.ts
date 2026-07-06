/**
 * 方向预承诺 — 对齐 academic-paper v3.6.6 预承诺 / Scoring Plan 协议
 *
 * Phase 1（本模块）：paper-blind — 仅基于 Socratic Q&A + 用户复述，不读取资产内容
 * Phase 2（分析 API）：paper-visible — 按已确认 Rubrics 对资产评分
 */

import type { DirectionAsset, DirectionAnalysis } from "@/contracts/direction";
import type { SocraticAnswer, SocraticQuestion } from "@/contracts/direction-socratic";
import { SOCRATIC_QUESTIONS } from "@/contracts/direction-socratic";
import { computeAssetInventoryHealth } from "@/lib/direction-asset-health";
import { isAnalysisFingerprintStale } from "@/lib/direction-analysis-fingerprint";

export interface AnalysisDimensionDef {
  id: string;
  name: string;
  weight: number;
  coreQuestion: string;
}

export const ANALYSIS_DIMENSIONS: AnalysisDimensionDef[] = [
  { id: "D1", name: "已有基础盘点", weight: 0.15, coreQuestion: "实验/论文按子方向分布如何？" },
  { id: "D2", name: "研究问题框架", weight: 0.15, coreQuestion: "能否以研究问题串联资产？" },
  { id: "D3", name: "研究缺口识别", weight: 0.15, coreQuestion: "文献有但实验室没做的？做了没写的？" },
  { id: "D4", name: "数据质量与充分性", weight: 0.15, coreQuestion: "每项实验数据能支撑多少结论？" },
  { id: "D5", name: "论文机会排序", weight: 0.15, coreQuestion: "已有数据能写哪些论文？优先级？" },
  { id: "D6", name: "实验补全路线", weight: 0.10, coreQuestion: "高优论文需补什么实验？" },
  { id: "D7", name: "创新性与竞争分析", weight: 0.10, coreQuestion: "在领域中的独特优势？是否太卷？" },
  { id: "D8", name: "跨方向协同机会", weight: 0.05, coreQuestion: "其他方向的方法/数据能否复用？" },
];

export interface PreCommitmentCheck {
  id: string;
  label: string;
  passed: boolean;
  severity: "high" | "medium" | "low";
  hint: string;
}

export interface PreCommitmentReadiness {
  ready: boolean;
  checks: PreCommitmentCheck[];
  assetCount: number;
  hasConfirmedContract: boolean;
  contractStale: boolean;
}

/** 预承诺门禁：资产盘点完成 + 未确认或需刷新 */
export function computePreCommitmentReadiness(
  assets: DirectionAsset[],
  analysis?: DirectionAnalysis | null,
): PreCommitmentReadiness {
  const assetHealth = computeAssetInventoryHealth(assets, analysis);
  const contract = analysis?.evaluationContract;
  const hasConfirmedContract = !!contract?.confirmedAt;
  const contractStale =
    hasConfirmedContract &&
    isAnalysisFingerprintStale(assets, analysis ?? null);

  const checks: PreCommitmentCheck[] = [
    {
      id: "assets_ready",
      label: "资产盘点必达项已完成",
      passed: assetHealth.readyForNextPhase,
      severity: "high",
      hint: assetHealth.readyForNextPhase
        ? "可进入预承诺"
        : assetHealth.checks.filter((c) => !c.passed && c.severity === "high").map((c) => c.label).join("、") || "请先完成资产盘点",
    },
    {
      id: "paper_blind",
      label: "制定标准时不读取资产内容（paper-blind）",
      passed: true,
      severity: "medium",
      hint: "Rubrics 仅基于你的问答与复述生成；分析阶段才会读取资产",
    },
    {
      id: "contract_confirmed",
      label: "评价标准已确认",
      passed: hasConfirmedContract && !contractStale,
      severity: "high",
      hint: hasConfirmedContract
        ? contractStale
          ? "资产已变更，建议重新确认评价标准"
          : "已确认，可启动 8 维度分析"
        : "完成 Socratic 问答 + 预承诺复述后确认",
    },
  ];

  return {
    ready: assetHealth.readyForNextPhase && hasConfirmedContract && !contractStale,
    checks,
    assetCount: assets.length,
    hasConfirmedContract,
    contractStale,
  };
}

const MIN_PARAPHRASE_DIMS = 4;

/** 用户预承诺复述是否满足最低维度数（对齐 Phase 4a minimum_dimensions） */
export function validateParaphraseComplete(
  paraphrases: Record<string, string>,
): { ok: boolean; filled: number; required: number } {
  const filled = ANALYSIS_DIMENSIONS.filter(
    (d) => (paraphrases[d.id] || "").trim().length >= 8,
  ).length;
  return { ok: filled >= MIN_PARAPHRASE_DIMS, filled, required: MIN_PARAPHRASE_DIMS };
}

/** 从问答启发式生成维度复述草稿（用户必须审核编辑） */
export function suggestParaphrasesFromAnswers(
  answers: Record<string, string>,
): Record<string, string> {
  const a = (id: string) => answers[id]?.trim() || "";
  const suggestions: Record<string, string> = {};

  if (a("q5")) {
    suggestions.D1 = `已有基础应覆盖核心优势子方向：${a("q5").slice(0, 80)}`;
    suggestions.D2 = `研究问题框架需围绕「${a("q5").slice(0, 40)}」等主线串联实验与论文`;
  }
  if (a("q1")) {
    suggestions.D7 = `创新性与期刊匹配：目标层次为「${a("q1").slice(0, 50)}」，新论文需达到相应档次`;
    suggestions.D5 = `论文机会排序应优先服务「${a("q1").slice(0, 40)}」层次的发表目标`;
  }
  const reps = a("q2");
  const stats = a("q3");
  if (reps || stats) {
    suggestions.D4 = `数据质量标准：独立重复 ≥ ${reps || "3"} 次${stats ? `；统计方法偏好 ${stats.slice(0, 60)}` : ""}`;
  }
  if (a("q4")) {
    suggestions.D5 = suggestions.D5
      ? `${suggestions.D5}；2 年目标约 ${a("q4")} 篇`
      : `2 年内规划约 ${a("q4")} 篇论文，按数据充分性排序`;
  }
  if (a("q6") || a("q7")) {
    suggestions.D6 = `实验补全需考虑实验室方法优势：${(a("q6") || a("q7")).slice(0, 80)}`;
  }
  if (a("q8") || a("q9")) {
    suggestions.D3 = `缺口识别需警惕历史退稿与数据限制：${[a("q8"), a("q9")].filter(Boolean).join("；").slice(0, 100)}`;
  }
  if (a("q10") && a("q10") !== "无") {
    suggestions.D8 = `跨方向协同：${a("q10").slice(0, 100)}`;
  }

  for (const dim of ANALYSIS_DIMENSIONS) {
    if (!suggestions[dim.id]) {
      suggestions[dim.id] = `${dim.name}：${dim.coreQuestion}（请用你自己的标准表述）`;
    }
  }
  return suggestions;
}

export function buildQaPayload(
  answers: Record<string, string>,
): SocraticAnswer[] {
  return SOCRATIC_QUESTIONS.map((q) => ({
    questionId: q.id,
    question: q.question,
    answer: answers[q.id]?.trim() || "（未填）",
  }));
}

export function questionsForDimension(dimId: string): SocraticQuestion[] {
  return SOCRATIC_QUESTIONS.filter((q) => q.relatedDimensions.includes(dimId));
}
