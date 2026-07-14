/**
 * PaperPassport — 论文 8 阶段生命周期快照（对齐 academic-paper skill / MASTER_PLAN §2.1）
 */

export type PaperPhase = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type PhaseStatus = "locked" | "ready" | "in_progress" | "done";

export const PAPER_PHASE_LABELS: readonly string[] = [
  "配置",
  "调研",
  "架构",
  "论证",
  "起草",
  "引用",
  "摘要",
  "审查",
] as const;

export interface PaperConfigRecord {
  paperTitle: string;
  paperType: "review" | "research";
  targetJournal: string;
  wordCount: string;
  language: "zh" | "en";
  citationStyle: "gbt7714" | "vancouver" | "apa7" | "ieee";
}

export interface PaperPassportSource {
  directionSlug: string;
  candidateId?: string;
  linkedAt: number;
}

export interface PaperLiteratureSnapshot {
  referenceCount: number;
  updatedAt: number;
}

export interface PaperDraftProgressSnapshot {
  filledCoreSections: number;
  totalCoreSections: number;
  expandedOutlineCount: number;
  outlineChars: number;
  hasBlueprint: boolean;
  updatedAt: number;
}

export interface PaperAbstractSnapshot {
  chars: number;
  updatedAt: number;
}

export interface PaperReviewSnapshot {
  doneCount: number;
  updatedAt: number;
}

export interface PaperPassport {
  version: 1;
  currentPhase: PaperPhase;
  phaseStatus: Record<`${PaperPhase}`, PhaseStatus>;
  config?: PaperConfigRecord;
  source?: PaperPassportSource;
  literature?: PaperLiteratureSnapshot;
  draftProgress?: PaperDraftProgressSnapshot;
  abstractSnapshot?: PaperAbstractSnapshot;
  reviewRound?: PaperReviewSnapshot;
  updatedAt: number;
}

const PHASE_KEYS: `${PaperPhase}`[] = ["0", "1", "2", "3", "4", "5", "6", "7"];
const PHASE_STATUSES = new Set<PhaseStatus>(["locked", "ready", "in_progress", "done"]);
const CITATION_STYLES = new Set<PaperConfigRecord["citationStyle"]>([
  "gbt7714",
  "vancouver",
  "apa7",
  "ieee",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPaperConfigRecord(value: unknown): value is PaperConfigRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.paperTitle === "string"
    && (value.paperType === "review" || value.paperType === "research")
    && typeof value.targetJournal === "string"
    && typeof value.wordCount === "string"
    && (value.language === "zh" || value.language === "en")
    && typeof value.citationStyle === "string"
    && CITATION_STYLES.has(value.citationStyle as PaperConfigRecord["citationStyle"])
  );
}

function isPaperPassportSource(value: unknown): value is PaperPassportSource {
  if (!isRecord(value)) return false;
  return (
    typeof value.directionSlug === "string"
    && typeof value.linkedAt === "number"
    && (value.candidateId === undefined || typeof value.candidateId === "string")
  );
}

function isLiteratureSnapshot(value: unknown): value is PaperLiteratureSnapshot {
  if (!isRecord(value)) return false;
  return typeof value.referenceCount === "number" && typeof value.updatedAt === "number";
}

function isDraftProgressSnapshot(value: unknown): value is PaperDraftProgressSnapshot {
  if (!isRecord(value)) return false;
  return (
    typeof value.filledCoreSections === "number"
    && typeof value.totalCoreSections === "number"
    && typeof value.expandedOutlineCount === "number"
    && typeof value.outlineChars === "number"
    && typeof value.hasBlueprint === "boolean"
    && typeof value.updatedAt === "number"
  );
}

function isAbstractSnapshot(value: unknown): value is PaperAbstractSnapshot {
  if (!isRecord(value)) return false;
  return typeof value.chars === "number" && typeof value.updatedAt === "number";
}

function isReviewSnapshot(value: unknown): value is PaperReviewSnapshot {
  if (!isRecord(value)) return false;
  return typeof value.doneCount === "number" && typeof value.updatedAt === "number";
}

export function isPaperPassport(value: unknown): value is PaperPassport {
  if (!isRecord(value) || value.version !== 1) return false;
  if (typeof value.currentPhase !== "number" || value.currentPhase < 0 || value.currentPhase > 7) {
    return false;
  }
  if (typeof value.updatedAt !== "number") return false;
  if (!isRecord(value.phaseStatus)) return false;
  for (const key of PHASE_KEYS) {
    const status = value.phaseStatus[key];
    if (typeof status !== "string" || !PHASE_STATUSES.has(status as PhaseStatus)) return false;
  }
  if (value.config !== undefined && !isPaperConfigRecord(value.config)) return false;
  if (value.source !== undefined && !isPaperPassportSource(value.source)) return false;
  if (value.literature !== undefined && !isLiteratureSnapshot(value.literature)) return false;
  if (value.draftProgress !== undefined && !isDraftProgressSnapshot(value.draftProgress)) return false;
  if (value.abstractSnapshot !== undefined && !isAbstractSnapshot(value.abstractSnapshot)) return false;
  if (value.reviewRound !== undefined && !isReviewSnapshot(value.reviewRound)) return false;
  return true;
}

export function createDefaultPhaseStatus(): Record<`${PaperPhase}`, PhaseStatus> {
  return {
    "0": "ready",
    "1": "locked",
    "2": "locked",
    "3": "locked",
    "4": "locked",
    "5": "locked",
    "6": "locked",
    "7": "locked",
  };
}

export function createInitialPaperPassport(
  config: PaperConfigRecord,
  source?: PaperPassportSource,
): PaperPassport {
  const now = Date.now();
  const phaseStatus = createDefaultPhaseStatus();
  phaseStatus["0"] = "done";
  phaseStatus["1"] = "ready";

  return {
    version: 1,
    currentPhase: 1,
    phaseStatus,
    config,
    source,
    updatedAt: now,
  };
}

export function parsePaperPassport(raw: string | null | undefined): PaperPassport | null {
  if (!raw?.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPaperPassport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function serializePaperPassport(passport: PaperPassport): string {
  return JSON.stringify(passport);
}

/** 将 paper-config-dialog 的配置写入 passport */
export function paperConfigToRecord(config: {
  paperTitle: string;
  paperType: "review" | "research";
  targetJournal: string;
  wordCount: string;
  language: "zh" | "en";
  citationStyle: "gbt7714" | "vancouver" | "apa7" | "ieee";
}): PaperConfigRecord {
  return { ...config };
}
