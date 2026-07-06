/** 研究方向战略规划 — 共享类型（前后端 + Prisma Direction 共享） */

import { isAnalysisFingerprintStale } from "@/lib/direction-analysis-fingerprint";

// ==================== 方向基础类型 ====================

export type DirectionStatus = "active" | "archived";

/** Prisma Direction 表的 DTO */
export interface DirectionDTO {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  categories: string[];
  status: DirectionStatus;
  assets?: DirectionAsset[] | null;
  analysis?: DirectionAnalysis | null;
  roadmap?: DirectionRoadmap | null;
  /** 知识库中该方向分类下的 PDF 总数（API 端实时计算） */
  literatureCount?: number;
  createdAt: number;
  updatedAt: number;
}

/** API 列表项（精简字段） */
export interface DirectionListItem {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  categories: string[];
  status: DirectionStatus;
  assetCount: number;
  createdAt: number;
  updatedAt: number;
}

// ==================== 资产类型 ====================

export type DirectionAssetKind = "experiment" | "paper" | "dataset";

export interface ExperimentAsset {
  id: string;
  kind: "experiment";
  title: string;
  dateRange: string;
  researchQuestion: string;
  methods: string;
  keyFindings: string;
  limitations: string;
  isNegativeResult: boolean;
  linkedDatasets: string[];
  linkedPapers: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PaperAsset {
  id: string;
  kind: "paper";
  doi: string;
  title: string;
  journal: string;
  year: number;
  impactFactor?: number;
  abstract: string;
  contribution: string;
  linkedExperiments: string[];
  source: "manual" | "knowledge_base" | "existing_project";
  createdAt: number;
  updatedAt: number;
}

export interface DatasetAsset {
  id: string;
  kind: "dataset";
  title: string;
  filePath?: string;
  variables: string;
  sampleSize?: string;
  linkedExperiments: string[];
  source: "manual" | "existing_data_claims";
  createdAt: number;
  updatedAt: number;
}

export type DirectionAsset = ExperimentAsset | PaperAsset | DatasetAsset;

// ==================== Rubric 类型 ====================

export interface RubricItem {
  id: string;
  what_to_look_for: string;
  what_triggers_block: string;
  what_triggers_warn: string;
  evidence_required: string;
}

export interface RubricResponse {
  rubricId: string;
  passed: boolean;
  evidence: string[];
  explanation: string;
}

// ==================== 分析类型 ====================

export interface AnalysisDimension {
  id: string;
  name: string;
  weight: number;
  score: number;
  summary: string;
  whatTriggersBlock: string;
  whatTriggersWarn: string;
  confidence: "high" | "medium" | "low";
  rubricResponses?: RubricResponse[];
}

export interface SynthesisResult {
  contradictions: Array<{
    pair: [string, string];
    severity: "high" | "medium" | "low";
    description: string;
    resolution: string;
    adjustedScores: Record<string, number>;
  }>;
  harmonizedScore: number;
  summary: string;
}

export interface PaperCandidate {
  id: string;
  title: string;
  tier: "ready" | "needs_experiment" | "long_term";
  dimensionScores: Record<string, number>;
  overallScore: number;
  requiredExperiments: string[];
  estimatedCompletion: string;
  suggestedJournal?: string;
}

export interface CrossDirectionOpportunity {
  directionSlug: string;
  description: string;
  confidence: "high" | "medium" | "low";
  synergyPoints: string[];
}

export interface DirectionAnalysis {
  generatedAt: number;
  analysisFingerprint: number;
  dimensions: AnalysisDimension[];
  paperCandidates: PaperCandidate[];
  crossDirectionOpportunities: CrossDirectionOpportunity[];
  synthesis?: SynthesisResult;
  evaluationContract?: {
    dimensions: Array<{
      id: string;
      name: string;
      weight: number;
      rubrics: RubricItem[];
    }>;
    confirmedAt: number;
  };
  /** 最近一次生成的基金申请书（持久化） */
  grantProposal?: GrantProposalSnapshot | null;
}

// ==================== 路线图类型 ====================

export interface RoadmapPaper {
  candidateId: string;
  priority: number;
  status: "planned" | "writing" | "submitted" | "published";
  linkedProjectId?: string;
}

export interface RoadmapTimelineEntry {
  quarter: string;
  papers: string[];
}

export interface ExperimentDependency {
  description: string;
  requiredBy: string[];
  estimatedDuration: string;
}

export interface DirectionRoadmap {
  generatedAt: number;
  analysisSnapshotId: number;
  papers: RoadmapPaper[];
  timeline: RoadmapTimelineEntry[];
  experimentDependencies: ExperimentDependency[];
  /** 用户审阅确认时间 */
  confirmedAt?: number;
  /** AI 生成的路线图摘要 */
  summary?: string;
}

export interface GrantProposalSnapshot {
  grantType: string;
  title: string;
  sections: Array<{ heading: string; content: string }>;
  generatedAt: number;
}

// ==================== 实验方案类型 ====================

export interface ExperimentPlanMethod {
  step: number;
  description: string;
  conditions: string;
  notes: string;
}

export interface ExperimentPlan {
  title: string;
  objective: string;
  rationale: string;
  methods: ExperimentPlanMethod[];
  expectedResults: string;
  equipmentNeeded: string[];
  sampleRequirements: string;
  estimatedDuration: string;
  keyReferences: string[];
  generatedAt: number;
  gapDescription: string;
}

// ==================== SSE 事件类型（Phase 3 分析流） ====================

export type DirectionSSEEvent =
  | { type: "batch_start"; batch: number; dimensions: string[] }
  | { type: "dimension_start"; dimensionId: string; provider: string }
  | { type: "dimension_delta"; dimensionId: string; delta: string }
  | { type: "dimension_done"; dimensionId: string; result: AnalysisDimension }
  | { type: "dimension_error"; dimensionId: string; error: string }
  | { type: "verifier_start"; dimensionId: string; provider: string }
  | { type: "verifier_done"; dimensionId: string; critique: string; confidenceAdjustment: number }
  | { type: "batch_done"; batch: number }
  | { type: "candidates"; candidates: PaperCandidate[] }
  | { type: "cross_direction"; opportunities: CrossDirectionOpportunity[] }
  | { type: "synthesis"; synthesis: SynthesisResult }
  | { type: "done"; analysis: DirectionAnalysis }
  | { type: "error"; message: string };

// ==================== 辅助函数 ====================

/** 从 Prisma Direction 行转换为 DirectionDTO */
export function prismaRowToDirectionDTO(row: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  categories: string[];
  status: string;
  assets: unknown;
  analysis: unknown;
  roadmap: unknown;
  createdAt: Date;
  updatedAt: Date;
}): DirectionDTO {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    categories: row.categories,
    status: row.status as DirectionStatus,
    assets: row.assets as DirectionAsset[] | null,
    analysis: row.analysis as DirectionAnalysis | null,
    roadmap: row.roadmap as DirectionRoadmap | null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

/** 从 DirectionDTO 提取列表项 */
export function directionDTOToListItems(dtos: DirectionDTO[]): DirectionListItem[] {
  return dtos.map((d) => ({
    id: d.id,
    slug: d.slug,
    name: d.name,
    description: d.description,
    categories: d.categories,
    status: d.status,
    assetCount: Array.isArray(d.assets) ? d.assets.length : 0,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));
}

/** 检测分析是否过期（资产或评价标准变更） */
export function isAnalysisStale(direction: DirectionDTO): boolean {
  if (!direction.analysis) return false;
  const assets = Array.isArray(direction.assets) ? direction.assets : [];
  return isAnalysisFingerprintStale(assets, direction.analysis);
}
