/** 扩写前「写作蓝图」— 大纲与章节扩写之间的战略摘要 */

export type FigurePlanType =
  | "flow"
  | "chart"
  | "xrd"
  | "table"
  | "schematic"
  | "other";

export type FigurePlanPriority = "required" | "optional";

export type FigureDataSource = "experiment" | "literature" | "synthesis";

/** 配图与项目实验数据的绑定（作图页 chartIdx 预填） */
export interface FigureDataBinding {
  kind: "chartConfig";
  chartConfigIndex: number;
  sourceFileName?: string;
  variable?: string;
  chartTitle?: string;
}

export interface FigurePlanItem {
  id: string;
  sectionPath: string;
  type: FigurePlanType;
  purpose: string;
  suggestedCaption: string;
  priority: FigurePlanPriority;
  dataSource?: FigureDataSource;
  dataBinding?: FigureDataBinding;
}

/** 本节预期反驳与回应（原 ArgumentBlueprint.rebuttals 并入） */
export interface SectionRebuttal {
  objection: string;
  response: string;
}

export interface SectionGuide {
  sectionPath: string;
  purpose: string;
  keyPoints: string[];
  estimatedParagraphs?: number;
  /** 从 Direction 预确定文献中分配到此章节的 sourceKey 列表 */
  assignedSources?: string[];
  // ====== 论证层（原独立 ArgumentBlueprint 已并入写作蓝图）======
  /** 本节核心主张 */
  claim?: string;
  /** 证据要点（文献主题/数据，勿编造具体数值） */
  evidenceHint?: string;
  /** 推理：证据如何支撑主张 */
  warrant?: string;
  /** 预期审稿质疑与回应 */
  rebuttal?: SectionRebuttal;
}

export interface WritingBlueprint {
  version: 1;
  narrativeSummary: string;
  thesis: string;
  estimatedWordCount: { min: number; max: number };
  figurePlan: {
    totalMin: number;
    totalMax: number;
    items: FigurePlanItem[];
  };
  sectionGuides: SectionGuide[];
  writingOrder: string[];
  prerequisites: string[];
  /** 论文类型（研究/综述），UI 据此切换显示区块与提示 */
  projectMode?: "research" | "review";
  /** 写作语言 */
  language?: "zh" | "en";
  /** 生成时对应的大纲指纹，用于检测大纲变更后蓝图过期 */
  outlineHash?: string;
  generatedAt: number;
  // ====== v4 方向战略层上下文（可选，从路线图或方向分析带入） ======
  /** 研究方向 slug（如 thermochemistry） */
  researchDirection?: string;
  /** 来自 D3 缺口分析——解释"为什么写这篇论文" */
  motivationFromGap?: string;
  /** 支撑这篇论文的已有哪些实验/数据资产 */
  dataBasis?: string[];
  /** 建议投稿的目标期刊 */
  targetJournal?: string;
  /** 写作时需标注"此处需补实验数据"的缺口 */
  pendingExperiments?: string[];
  /** 来源的路线图候选人 ID（用于追溯） */
  roadmapCandidateId?: string;
  // ====== 论证层（全文级，原 ArgumentBlueprint 顶栏字段）======
  /** 研究问题（可选） */
  researchQuestion?: string;
  /** 证据缺口 / 需补强处 */
  argumentGaps?: string[];
}

export function serializeWritingBlueprint(blueprint: WritingBlueprint): string {
  return JSON.stringify(blueprint);
}

export function parseWritingBlueprint(raw: string | null | undefined): WritingBlueprint | null {
  if (!raw?.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isWritingBlueprint(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isWritingBlueprint(value: unknown): value is WritingBlueprint {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1) return false;
  if (typeof v.narrativeSummary !== "string" || typeof v.thesis !== "string") return false;
  if (typeof v.generatedAt !== "number") return false;
  if (!isWordCount(v.estimatedWordCount)) return false;
  if (!isFigurePlan(v.figurePlan)) return false;
  if (!Array.isArray(v.sectionGuides) || !v.sectionGuides.every(isSectionGuide)) return false;
  if (!Array.isArray(v.writingOrder) || !v.writingOrder.every((s) => typeof s === "string")) return false;
  if (!Array.isArray(v.prerequisites) || !v.prerequisites.every((s) => typeof s === "string")) return false;
  return true;
}

function isWordCount(value: unknown): value is { min: number; max: number } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.min === "number" && typeof v.max === "number";
}

function isFigurePlan(value: unknown): value is WritingBlueprint["figurePlan"] {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.totalMin !== "number" || typeof v.totalMax !== "number") return false;
  if (!Array.isArray(v.items) || !v.items.every(isFigurePlanItem)) return false;
  return true;
}

function isFigureDataBinding(value: unknown): value is FigureDataBinding {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.kind === "chartConfig" &&
    typeof v.chartConfigIndex === "number" &&
    Number.isInteger(v.chartConfigIndex) &&
    v.chartConfigIndex >= 0
  );
}

function isFigurePlanItem(value: unknown): value is FigurePlanItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const types = new Set(["flow", "chart", "xrd", "table", "schematic", "other"]);
  const priorities = new Set(["required", "optional"]);
  return (
    typeof v.id === "string" &&
    typeof v.sectionPath === "string" &&
    typeof v.type === "string" &&
    types.has(v.type) &&
    typeof v.purpose === "string" &&
    typeof v.suggestedCaption === "string" &&
    typeof v.priority === "string" &&
    priorities.has(v.priority) &&
    (v.dataBinding === undefined || isFigureDataBinding(v.dataBinding))
  );
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isSectionRebuttal(value: unknown): value is SectionRebuttal {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.objection === "string" && typeof v.response === "string";
}

function isSectionGuide(value: unknown): value is SectionGuide {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.sectionPath !== "string" ||
    typeof v.purpose !== "string" ||
    !Array.isArray(v.keyPoints) ||
    !v.keyPoints.every((p) => typeof p === "string")
  ) {
    return false;
  }
  if (!isOptionalString(v.claim) || !isOptionalString(v.evidenceHint) || !isOptionalString(v.warrant)) {
    return false;
  }
  if (v.rebuttal !== undefined && !isSectionRebuttal(v.rebuttal)) return false;
  return true;
}
