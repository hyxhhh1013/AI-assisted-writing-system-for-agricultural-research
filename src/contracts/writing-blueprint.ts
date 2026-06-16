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

export interface FigurePlanItem {
  id: string;
  sectionPath: string;
  type: FigurePlanType;
  purpose: string;
  suggestedCaption: string;
  priority: FigurePlanPriority;
  dataSource?: FigureDataSource;
}

export interface SectionGuide {
  sectionPath: string;
  purpose: string;
  keyPoints: string[];
  estimatedParagraphs?: number;
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
  /** 生成时对应的大纲指纹，用于检测大纲变更后蓝图过期 */
  outlineHash?: string;
  generatedAt: number;
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
    priorities.has(v.priority)
  );
}

function isSectionGuide(value: unknown): value is SectionGuide {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sectionPath === "string" &&
    typeof v.purpose === "string" &&
    Array.isArray(v.keyPoints) &&
    v.keyPoints.every((p) => typeof p === "string")
  );
}
