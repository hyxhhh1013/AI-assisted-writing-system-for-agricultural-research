/**
 * 论文质量评测（W3-AP-QUALITY-EVAL）— 一把「量质量的尺子」。
 *
 * 目的：把 prompt/门禁改动从「盲调」变成「可度量」——每次改完跑一次，
 * 得到四维分数与 overallScore，判断方向对不对。
 *
 * 四个维度：
 * - structure   结构完整性（必选节 + 主体节篇幅）
 * - citation    引用支撑（越界硬检 + 词重叠可疑占比；claim 级判定见 validate_citations）
 * - consistency 跨节一致性（数据-结论回扣 + 方法-结果术语连续性）
 * - overclaim   结论语气克制（overclaim 措辞 vs hedge）
 */

export interface QualitySection {
  key: string;
  title: string;
  content: string;
}

export interface QualityReference {
  index: number;
  title?: string | null;
  abstract?: string | null;
  content?: string | null;
}

export type QualityDimensionKey =
  | "structure"
  | "citation"
  | "consistency"
  | "overclaim";

export interface QualityDimensionResult {
  key: QualityDimensionKey;
  label: string;
  /** 0-100 */
  score: number;
  issues: string[];
  strengths: string[];
}

export interface QualityEvalInput {
  title?: string;
  sections: QualitySection[];
  references: QualityReference[];
}

export interface QualityEvalReport {
  dimensions: QualityDimensionResult[];
  /** 0-100 加权总分 */
  overallScore: number;
  issues: string[];
  strengths: string[];
  createdAt: string;
}
