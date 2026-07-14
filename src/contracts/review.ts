/**
 * 论文审查系统类型定义
 *
 * 四维度审查：学术规范 / 论证质量 / 结构规范 / 学术诚信
 */

// ==================== 审查维度 ====================

export type ReviewDimension = "academic" | "argument" | "structure" | "integrity";

// ==================== 问题类型 ====================

// 学术规范问题类型
export type AcademicIssueType =
  | "slang"           // 口语化用词
  | "terminology"     // 术语不一致
  | "sentence"        // 句式不规范
  | "vague"           // 模糊表述
  | "formula";        // 公式符号问题

// 论证质量问题类型
export type ArgumentIssueType =
  | "evidence"        // 论点缺乏论据
  | "logic"           // 逻辑错误
  | "causality"       // 因果关系不当
  | "overclaim"       // 过度声称
  | "counter"         // 缺乏反面论证
  | "criticism";      // 文献批判性不足

// 结构规范问题类型
export type StructureIssueType =
  | "section"         // 章节不完整
  | "figure_ref"      // 图表引用问题
  | "reference"       // 参考文献格式
  | "abstract"        // 摘要问题
  | "keywords";       // 关键词问题

// 学术诚信问题类型
export type IntegrityIssueType =
  | "fake_citation"     // 引用真实性问题
  | "data_inconsistency" // 数据不一致
  | "stats_misuse"      // 统计方法滥用
  | "reproducibility"   // 可复现性问题
  | "suspicious_result" // 结果可疑
  | "verbatim_copy"     // 综述：疑似照搬
  | "data_misattribution" // 综述：数据归属错误
  | "uncited_data"      // 综述：未标注来源的数据
  | "synthesis_gap";    // 综述：缺乏综合

export type ReviewIssueType =
  | AcademicIssueType
  | ArgumentIssueType
  | StructureIssueType
  | IntegrityIssueType;

// ==================== 审查问题 ====================

export interface ReviewIssue {
  id: string;
  dimension: ReviewDimension;
  type: ReviewIssueType;
  severity: "high" | "medium" | "low";
  location: string;        // "第X节 / 表X / 图X"
  evidence: string;        // 证据锚点：引用原文具体位置
  description: string;     // 问题描述
  suggestion: string;      // 改进建议
  originalText?: string;   // 原文片段
}

// ==================== 维度结果 ====================

export interface DimensionResult {
  score: number;           // 0-100
  grade: "A" | "B" | "C" | "D";
  issueCount: number;
  breakdown: {
    high: number;
    medium: number;
    low: number;
  };
  basis: string[];         // 打分依据说明
  issues: ReviewIssue[];
}

// ==================== 审查报告 ====================

export interface ReviewReport {
  reviewId: string;
  projectId?: string;
  synopsis: string;        // 论文概要 ≤150字
  summary: string;         // 总体评价 3-5句
  dimensions: {
    academic: DimensionResult;
    argument: DimensionResult;
    structure: DimensionResult;
    integrity: DimensionResult;
  };
  overallScore: number;    // 综合分（加权平均）
  overallGrade: "A" | "B" | "C" | "D";
  createdAt: string;
}

// ==================== 审查配置 ====================

export interface ReviewConfig {
  /** 要审查的维度，默认全部 */
  dimensions?: ReviewDimension[];
  /** 投稿目标期刊/会议（可选，影响部分检查标准） */
  target?: string;
  /** 是否包含学术诚信检测，默认 true */
  includeIntegrity?: boolean;
  /** 写作模式：review=文献综述 research=创新型论文 */
  projectMode?: "review" | "research";
}

// ==================== 审查输入 ====================

export interface ReviewInput {
  projectId?: string;
  title: string;
  sections: Array<{
    key: string;       // abstract / introduction / background / literature_body / methods / results / conclusion …
    title: string;     // 章节标题
    content: string;   // 章节内容
  }>;
  outline?: string;    // 论文大纲（可选，用于结构检查）
  references?: string[]; // 参考文献列表（可选，用于引用验证）
  config?: ReviewConfig;
  /** 写作模式（也可放在 config.projectMode） */
  projectMode?: "review" | "research";
}

// ==================== 修复状态 ====================

export type IssueStatus = "open" | "fixing" | "fixed" | "dismissed";

export interface FixableReviewIssue extends ReviewIssue {
  status: IssueStatus;
  fixedContent?: string;
}

export interface FixableReviewReport extends Omit<ReviewReport, "dimensions"> {
  dimensions: {
    [K in ReviewDimension]: DimensionResult & {
      issues: FixableReviewIssue[];
    };
  };
}

// ==================== API 响应 ====================

export interface ReviewApiResponse {
  success: boolean;
  report?: ReviewReport;
  error?: string;
}

export interface FixIssueApiResponse {
  success: boolean;
  fixedContent?: string;
  error?: string;
}

// ==================== API 层类型（DB 记录 + 请求/响应 DTO） ====================

export interface ReviewHistoryItem {
  id: string;
  projectId: string | null;
  title: string;
  overallScore: number | null;
  overallGrade: string | null;
  summary: string | null;
  synopsis: string | null;
  status: string;
  createdAt: string;
}

export interface ReviewDetailRecord {
  id: string;
  projectId: string | null;
  title: string;
  overallScore: number | null;
  overallGrade: string | null;
  summary: string | null;
  synopsis: string | null;
  status: string;
  createdAt: string;
  dimensionScores?: string | null;
}

export interface ReviewDetailIssueRecord {
  id: string;
  checkId: string;
  dimension: string;
  type: string;
  severity: string;
  location: string;
  evidence: string;
  description: string;
  suggestion: string;
  originalText: string | null;
  status?: string | null;
}

export interface ReviewDetailResponse {
  check: ReviewDetailRecord;
  issues: ReviewDetailIssueRecord[];
}

export interface RunReviewRequest {
  projectId?: string;
  title: string;
  sections: Array<{
    key: string;
    title: string;
    content: string;
  }>;
  outline?: string;
  references?: string[];
  dimensions?: ReviewDimension[];
  target?: string;
  projectMode?: "review" | "research";
}

export interface ReviewFixIssueRequest {
  dimension: ReviewDimension;
  issueIndex: number;
  sectionContents: Record<string, string>;
  title: string;
  suggestion: string;
  originalText?: string;
}
