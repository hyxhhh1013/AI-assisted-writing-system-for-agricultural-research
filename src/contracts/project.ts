/** 项目领域类型唯一出口：UI/hooks/API 请 `import type { ProjectData } from "@/contracts/project"` */
import type { DataSourceAnalysis, EvidenceClaim } from "./data-source";

/** 项目写作语言：创建时选定，大纲/扩写/蓝图 API 统一使用 */
export type ProjectLanguage = "zh" | "en";

export const PROJECT_LANGUAGES: readonly ProjectLanguage[] = ["zh", "en"] as const;

export function resolveProjectLanguage(
  project: Pick<ProjectDTO, "language"> | null | undefined,
): ProjectLanguage {
  return project?.language === "en" ? "en" : "zh";
}

export interface ProjectDTO {
  id: string;
  title: string;
  userId?: string;
  authors: string;
  affiliations: string;
  abstract: string;
  keywords: string;
  classification: string;
  researchDirection: string;
  outline: string;
  template: string;
  lastUpdated: number;
  createdAt?: number;
  sections: Record<string, string>;
  references: string[];
  analysisResults: string[];
  charts?: string;
  expandedOutlineSections?: string[];
  mode?: "review" | "research";
  /** 写作语言：zh | en */
  language?: ProjectLanguage;
  /** 引用格式标准：gbt7714 | vancouver | apa7 | ieee */
  citationStyle?: "gbt7714" | "vancouver" | "apa7" | "ieee";
  /** JSON string: EvidenceClaim[] */
  dataClaims?: string;
  /** JSON string: DataSourceAnalysis[] */
  dataSources?: string;
  /** JSON string: WritingBlueprint — 扩写前写作蓝图；null 表示清空 */
  writingBlueprint?: string | null;
  /** JSON string: ArgumentBlueprint — Phase 3 论证蓝图；null 表示清空 */
  argumentBlueprint?: string | null;
  /** JSON string: PaperPassport — 8 阶段论文生命周期快照 */
  paperPassport?: string | null;
}

/** Alias kept for backward compat — prefer ProjectDTO in new code */
export type ProjectData = ProjectDTO;

const CLAIM_TYPES = new Set(["mean", "comparison", "trend", "correlation", "model_fit", "ranking"]);
const SOURCE_TYPES = new Set(["data", "literature"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEvidenceClaim(value: unknown): value is EvidenceClaim {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || typeof value.sourceId !== "string") return false;
  if (typeof value.text !== "string" || typeof value.type !== "string") return false;
  if (!CLAIM_TYPES.has(value.type) || !SOURCE_TYPES.has(value.sourceType as string)) return false;
  if (!isRecord(value.values) || !Array.isArray(value.variables)) return false;
  if (typeof value.tolerance !== "number") return false;
  return value.variables.every((v) => typeof v === "string");
}

function isDataSourceAnalysis(value: unknown): value is DataSourceAnalysis {
  if (!isRecord(value)) return false;
  if (typeof value.fileName !== "string" || typeof value.rowCount !== "number") return false;
  if (typeof value.generatedAt !== "number" || !Array.isArray(value.columns)) return false;
  if (!Array.isArray(value.stats)) return false;
  return true;
}

/** 安全解析 project.dataClaims JSON → EvidenceClaim[] */
export function parseDataClaims(project: Pick<ProjectDTO, "dataClaims">): EvidenceClaim[] {
  if (!project.dataClaims) return [];
  try {
    const parsed: unknown = JSON.parse(project.dataClaims);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEvidenceClaim);
  } catch {
    return [];
  }
}

/** 安全解析 project.dataSources JSON → DataSourceAnalysis[] */
export function parseDataSources(project: Pick<ProjectDTO, "dataSources">): DataSourceAnalysis[] {
  if (!project.dataSources) return [];
  try {
    const parsed: unknown = JSON.parse(project.dataSources);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDataSourceAnalysis);
  } catch {
    return [];
  }
}

/** 序列化 evidence 字段回 Project JSON 列 */
export function serializeDataClaims(claims: EvidenceClaim[]): string {
  return JSON.stringify(claims);
}

export function serializeDataSources(sources: DataSourceAnalysis[]): string {
  return JSON.stringify(sources);
}

/** 解析 DB 中的 expandedOutlineSections JSON → 大纲任务 id 列表 */
export function parseExpandedOutlineSections(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

export function serializeExpandedOutlineSections(ids: string[]): string {
  return JSON.stringify(ids);
}

export interface ProjectMetaPatch {
  title?: string;
  authors?: string;
  affiliations?: string;
  abstract?: string;
  keywords?: string;
  classification?: string;
  researchDirection?: string;
  outline?: string;
  template?: string;
  citationStyle?: "gbt7714" | "vancouver" | "apa7" | "ieee";
  expandedOutlineSections?: string[];
  writingBlueprint?: string;
}

export interface SectionPatch {
  content: string;
  clientUpdatedAt: number;  // 乐观锁
}

export interface ReferencesPatch {
  references: string[];
  clientUpdatedAt: number;
}

/** 数据库参考文献行（增量 PATCH 响应） */
export interface ProjectReferenceRecord {
  id: string;
  content: string;
  order: number;
}

export type ReferencePatchOp =
  | { op: "create"; content: string; index?: number }
  | { op: "update"; id: string; content: string }
  | { op: "delete"; id: string }
  | { op: "replace"; items: string[] };

export interface ProjectAnalysisRecord {
  id: string;
  content: string;
}

export type AnalysisResultPatchOp =
  | { op: "create"; content: string }
  | { op: "update"; id: string; content: string }
  | { op: "delete"; id: string };

export interface ReferencesPatchRequest {
  ops: ReferencePatchOp[];
}

export interface ReferencesPatchResponse {
  references: ProjectReferenceRecord[];
}

export interface AnalysisResultsPatchRequest {
  ops: AnalysisResultPatchOp[];
}

export interface AnalysisResultsPatchResponse {
  analysisResults: ProjectAnalysisRecord[];
}

/** Evidence 字段增量 PATCH（dataClaims / dataSources JSON 字符串） */
export interface ProjectEvidencePatch {
  dataClaims?: string;
  dataSources?: string;
}
