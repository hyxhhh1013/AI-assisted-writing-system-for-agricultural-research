/** Direction 级文献 corpus（P1 调研产物，Handoff 到写作项目 references） */

import type { RequiredReference, SourceRole } from "@/contracts/direction-writing-bridge";

export type DirectionLiteratureSource = "knowledge_pdf" | "external" | "manual";

export interface DirectionLiteratureEntry {
  id: string;
  source: DirectionLiteratureSource;
  /** 知识库 PDF 文件名 */
  sourceKey?: string;
  /** 外部库 ID（OpenAlex 等） */
  externalId?: string;
  title: string;
  /** 格式化引文（GB/T 等） */
  citation: string;
  role: SourceRole;
  doi?: string;
  addedAt: number;
}

export interface DirectionLiteratureState {
  entries: DirectionLiteratureEntry[];
  /** 用户确认 corpus 可用于写作 Handoff */
  confirmedAt?: number;
}

export const MIN_REVIEW_CORPUS_ENTRIES = 3;
export const MIN_REVIEW_HANDOFF_ENTRIES = 1;

export function emptyLiteratureState(): DirectionLiteratureState {
  return { entries: [] };
}

export function parseDirectionLiteratureState(raw: unknown): DirectionLiteratureState {
  if (!raw || typeof raw !== "object") return emptyLiteratureState();
  const value = raw as Record<string, unknown>;
  const entries = Array.isArray(value.entries)
    ? value.entries.filter(isLiteratureEntry)
    : [];
  const confirmedAt =
    typeof value.confirmedAt === "number" && value.confirmedAt > 0
      ? value.confirmedAt
      : undefined;
  return { entries, confirmedAt };
}

function isLiteratureEntry(raw: unknown): raw is DirectionLiteratureEntry {
  if (!raw || typeof raw !== "object") return false;
  const e = raw as Record<string, unknown>;
  return (
    typeof e.id === "string"
    && typeof e.source === "string"
    && typeof e.title === "string"
    && typeof e.citation === "string"
    && typeof e.role === "string"
    && typeof e.addedAt === "number"
  );
}

export function countCoreLiterature(state: DirectionLiteratureState): number {
  return state.entries.filter((e) => e.role === "core").length;
}

export function corpusEntryToRequiredReference(
  entry: DirectionLiteratureEntry,
): RequiredReference {
  return {
    sourceKey: entry.sourceKey || entry.title,
    title: entry.title,
    authors: [],
    year: 0,
    doi: entry.doi,
    role: entry.role,
    assignedSections:
      entry.role === "core"
        ? ["literature_body"]
        : entry.role === "supporting"
          ? ["literature_body", "background"]
          : ["introduction", "background"],
  };
}

export function corpusToCitationList(
  entries: DirectionLiteratureEntry[],
): string[] {
  return entries.map((e) => e.citation.trim()).filter(Boolean);
}
