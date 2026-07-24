/**
 * Argument Blueprint — 论文 Phase 3 论证蓝图
 * 与 WritingBlueprint（叙事/配图）分离：本文件只管「主张—证据—推理」与反驳。
 */

export type ArgumentConfidence = "high" | "medium" | "low";

/** 主张—证据—推理链（Toulmin 简化） */
export interface ClaimEvidenceWarrant {
  id: string;
  /** 主张 */
  claim: string;
  /** 证据（文献/实验/数据） */
  evidence: string;
  /** 推理：为何证据支撑主张 */
  warrant: string;
  /** 对应大纲节点（完整路径，可选） */
  sectionPath?: string;
  confidence?: ArgumentConfidence;
}

export interface RebuttalStrategy {
  id: string;
  /** 预期反驳 / 审稿质疑 */
  objection: string;
  /** 回应策略 */
  response: string;
  relatedClaimId?: string;
}

export interface ArgumentBlueprint {
  version: 1;
  /** 中心论点 */
  centralThesis: string;
  researchQuestion?: string;
  chains: ClaimEvidenceWarrant[];
  rebuttals: RebuttalStrategy[];
  /** 证据缺口 / 需补强处 */
  gaps: string[];
  /** 生成时大纲指纹 */
  outlineHash?: string;
  generatedAt: number;
}

export function serializeArgumentBlueprint(blueprint: ArgumentBlueprint): string {
  return JSON.stringify(blueprint);
}

export function parseArgumentBlueprint(
  raw: string | null | undefined,
): ArgumentBlueprint | null {
  if (!raw?.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isArgumentBlueprint(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isArgumentBlueprint(value: unknown): value is ArgumentBlueprint {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1) return false;
  if (typeof v.centralThesis !== "string" || typeof v.generatedAt !== "number") return false;
  if (!Array.isArray(v.chains) || !v.chains.every(isChain)) return false;
  if (!Array.isArray(v.rebuttals) || !v.rebuttals.every(isRebuttal)) return false;
  if (!Array.isArray(v.gaps) || !v.gaps.every((g) => typeof g === "string")) return false;
  return true;
}

function isChain(value: unknown): value is ClaimEvidenceWarrant {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const confOk =
    v.confidence === undefined
    || v.confidence === "high"
    || v.confidence === "medium"
    || v.confidence === "low";
  return (
    typeof v.id === "string"
    && typeof v.claim === "string"
    && typeof v.evidence === "string"
    && typeof v.warrant === "string"
    && confOk
  );
}

function isRebuttal(value: unknown): value is RebuttalStrategy {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string"
    && typeof v.objection === "string"
    && typeof v.response === "string"
  );
}
