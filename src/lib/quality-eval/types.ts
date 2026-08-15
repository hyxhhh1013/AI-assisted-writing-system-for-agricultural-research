/**
 * 论文质量评测（W3-AP-QUALITY-EVAL / QUALITY-JUDGE）— 两把尺。
 *
 * 规则尺（checks/score，确定性）：CI 地板。prompt/门禁改完跑一次，判断方向对不对。
 * 模型尺（llm-judge.ts）：仅 `eval:quality` 回归对照；禁止进 write_section / toolsNode。
 *
 * 规则四维：
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

/** LLM-judge 四维（仅 eval:quality；不进写节热路径） */
export type QualityLlmDimensionKey =
  | "citation_support"
  | "data_conclusion"
  | "overclaim"
  | "coherence";

export interface QualityLlmDimensionScore {
  key: QualityLlmDimensionKey;
  label: string;
  /** 0-100 */
  score: number;
  comment: string;
}

export interface QualityLlmReport {
  dimensions: QualityLlmDimensionScore[];
  /** 四维算术平均，0-100 */
  overallScore: number;
  skipped: boolean;
  skipReason?: string;
}

export type QualityPaperJudge = (input: QualityEvalInput) => Promise<QualityLlmReport>;
