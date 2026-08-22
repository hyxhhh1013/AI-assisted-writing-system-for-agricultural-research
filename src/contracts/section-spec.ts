/**
 * SectionSpec V1 — 写节中间表示（WRITE-QA-001）。
 * Agent 提交本节语义合同；旧 write_section.context / bullets 经适配器升格，不立刻删除。
 * Compiler / Evidence Binder 在 002 / 004；本文件只做契约与适配。
 */

export const SECTION_SPEC_VERSION = 1 as const;

/** 与 Agent 写工具共用的章节 key（契约层自持，避免 contracts → lib） */
export const SECTION_SPEC_KEYS = [
  "abstract",
  "introduction",
  "background",
  "literature_body",
  "methods",
  "results",
  "discussion",
  "conclusion",
] as const;

export type SectionSpecKey = (typeof SECTION_SPEC_KEYS)[number];

/** 语域：质量规则按 register 判定，不按原始 key */
export const SECTION_REGISTERS = [
  "introduction",
  "methods",
  "results",
  "discussion",
  "review_body",
  "conclusion",
  "abstract",
] as const;

export type SectionRegister = (typeof SECTION_REGISTERS)[number];

export type ClaimEvidenceRef = {
  kind: "ref";
  n: number;
  grounded: "full" | "soft";
};

export type ClaimEvidenceData = {
  kind: "data";
  id: string;
};

export type ClaimEvidence = ClaimEvidenceRef | ClaimEvidenceData;

export interface SectionClaimCard {
  id: string;
  claim: string;
  evidence: ClaimEvidence[];
  warrant?: string;
}

export interface SectionSpecConstraints {
  minChars: number;
  maxChars: number;
  forbidDiscussionInResults?: boolean;
  forbidInlineCite?: boolean;
}

export interface SectionSpecV1 {
  version: 1;
  sectionKey: SectionSpecKey;
  subsectionTitle?: string;
  register: SectionRegister;
  claimCards: SectionClaimCard[];
  constraints: SectionSpecConstraints;
  assignedSourceIds: string[];
  figureSlots: string[];
}

/** 旧 write_section 入参（升格用） */
export interface WriteSectionInputLike {
  sectionKey: string;
  subsectionTitle?: string;
  context?: string;
  bullets?: string[];
  assignedSourceIds?: string[];
  figureSlots?: string[];
}

/** 蓝图 SectionGuide 最小形状（升格 claim cards） */
export interface SectionGuideLike {
  claim?: string;
  keyPoints?: string[];
  warrant?: string;
  assignedSources?: string[];
}

const KEY_SET = new Set<string>(SECTION_SPEC_KEYS);
const REGISTER_SET = new Set<string>(SECTION_REGISTERS);
const GROUNDED_SET = new Set<string>(["full", "soft"]);

/** 语域默认字数带（中文；002 Compiler 可按 mode/language 覆盖） */
const DEFAULT_CONSTRAINTS: Record<SectionRegister, SectionSpecConstraints> = {
  abstract: { minChars: 150, maxChars: 400, forbidInlineCite: true },
  introduction: { minChars: 400, maxChars: 2500 },
  methods: { minChars: 900, maxChars: 3000 },
  results: { minChars: 900, maxChars: 3000, forbidDiscussionInResults: true },
  discussion: { minChars: 700, maxChars: 2500 },
  conclusion: { minChars: 150, maxChars: 1200 },
  review_body: { minChars: 800, maxChars: 4000 },
};

const SUBSECTION_MAX_CHARS = 2500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSectionSpecKey(value: string): value is SectionSpecKey {
  return KEY_SET.has(value);
}

export function isSectionRegister(value: string): value is SectionRegister {
  return REGISTER_SET.has(value);
}

/** 章节 key → 语域。background / literature_body 都走综述正文规则。 */
export function registerFromSectionKey(sectionKey: string): SectionRegister | null {
  if (!isSectionSpecKey(sectionKey)) return null;
  if (sectionKey === "background" || sectionKey === "literature_body") return "review_body";
  return sectionKey;
}

export function defaultConstraintsFor(
  register: SectionRegister,
  options?: { subsectionTitle?: string },
): SectionSpecConstraints {
  const base = DEFAULT_CONSTRAINTS[register];
  const constraints: SectionSpecConstraints = {
    minChars: base.minChars,
    maxChars: base.maxChars,
  };
  if (base.forbidDiscussionInResults) constraints.forbidDiscussionInResults = true;
  if (base.forbidInlineCite) constraints.forbidInlineCite = true;
  if (options?.subsectionTitle?.trim()) {
    constraints.maxChars = Math.min(constraints.maxChars, SUBSECTION_MAX_CHARS);
  }
  return constraints;
}

function parseEvidence(raw: unknown): ClaimEvidence[] {
  if (!Array.isArray(raw)) return [];
  const out: ClaimEvidence[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.kind !== "string") continue;
    if (item.kind === "ref") {
      const n = typeof item.n === "number" ? item.n : Number(item.n);
      if (!Number.isInteger(n) || n < 1) continue;
      if (typeof item.grounded !== "string" || !GROUNDED_SET.has(item.grounded)) continue;
      out.push({ kind: "ref", n, grounded: item.grounded as "full" | "soft" });
      continue;
    }
    if (item.kind === "data" && typeof item.id === "string" && item.id.trim()) {
      out.push({ kind: "data", id: item.id.trim() });
    }
  }
  return out;
}

function parseClaimCard(raw: unknown, index: number): SectionClaimCard | null {
  if (!isRecord(raw) || typeof raw.claim !== "string" || !raw.claim.trim()) return null;
  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : `C${index + 1}`;
  const card: SectionClaimCard = {
    id,
    claim: raw.claim.trim(),
    evidence: parseEvidence(raw.evidence),
  };
  if (typeof raw.warrant === "string" && raw.warrant.trim()) {
    card.warrant = raw.warrant.trim();
  }
  return card;
}

function parseConstraints(
  raw: unknown,
  fallback: SectionSpecConstraints,
): SectionSpecConstraints | null {
  if (raw === undefined) return fallback;
  if (!isRecord(raw)) return null;
  const minChars = typeof raw.minChars === "number" ? raw.minChars : fallback.minChars;
  const maxChars = typeof raw.maxChars === "number" ? raw.maxChars : fallback.maxChars;
  if (!Number.isFinite(minChars) || !Number.isFinite(maxChars) || minChars < 0 || maxChars < minChars) {
    return null;
  }
  const constraints: SectionSpecConstraints = {
    minChars: Math.floor(minChars),
    maxChars: Math.floor(maxChars),
  };
  if (raw.forbidDiscussionInResults === true || fallback.forbidDiscussionInResults) {
    constraints.forbidDiscussionInResults = true;
  }
  if (raw.forbidInlineCite === true || fallback.forbidInlineCite) {
    constraints.forbidInlineCite = true;
  }
  return constraints;
}

function parseStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** 严格解析未知 JSON → SectionSpecV1；失败返回 null */
export function parseSectionSpec(raw: unknown): SectionSpecV1 | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== 1) return null;
  if (typeof raw.sectionKey !== "string" || !isSectionSpecKey(raw.sectionKey)) return null;
  const inferred = registerFromSectionKey(raw.sectionKey);
  if (!inferred) return null;
  const register =
    typeof raw.register === "string" && isSectionRegister(raw.register)
      ? raw.register
      : inferred;
  const subsectionTitle =
    typeof raw.subsectionTitle === "string" && raw.subsectionTitle.trim()
      ? raw.subsectionTitle.trim()
      : undefined;
  const fallback = defaultConstraintsFor(register, { subsectionTitle });
  const constraints = parseConstraints(raw.constraints, fallback);
  if (!constraints) return null;
  if (!Array.isArray(raw.claimCards)) return null;
  const claimCards: SectionClaimCard[] = [];
  for (let i = 0; i < raw.claimCards.length; i += 1) {
    const card = parseClaimCard(raw.claimCards[i], i);
    if (!card) return null;
    claimCards.push(card);
  }
  return {
    version: 1,
    sectionKey: raw.sectionKey,
    subsectionTitle,
    register,
    claimCards,
    constraints,
    assignedSourceIds: parseStringList(raw.assignedSourceIds),
    figureSlots: parseStringList(raw.figureSlots),
  };
}

export function isSectionSpecV1(value: unknown): value is SectionSpecV1 {
  return parseSectionSpec(value) !== null;
}

export function claimCardId(index: number): string {
  return `C${index + 1}`;
}

/** 蓝图要点 / 主张 → claim cards（证据槽留空，004 再绑） */
export function sectionGuideToClaimCards(guide: SectionGuideLike): SectionClaimCard[] {
  const points = (guide.keyPoints ?? [])
    .map((p) => p.trim())
    .filter(Boolean);
  const warrant = guide.warrant?.trim() || undefined;
  if (points.length > 0) {
    return points.map((claim, i) => {
      const card: SectionClaimCard = {
        id: claimCardId(i),
        claim,
        evidence: [],
      };
      if (i === 0 && warrant) card.warrant = warrant;
      return card;
    });
  }
  const claim = guide.claim?.trim();
  if (!claim) return [];
  const card: SectionClaimCard = { id: "C1", claim, evidence: [] };
  if (warrant) card.warrant = warrant;
  return [card];
}

function bulletsToClaimCards(bullets: string[]): SectionClaimCard[] {
  return bullets
    .map((b) => b.trim())
    .filter(Boolean)
    .map((claim, i) => ({
      id: claimCardId(i),
      claim,
      evidence: [],
    }));
}

/**
 * 旧 write_section.context / bullets → SectionSpecV1。
 * bullets 优先；只有 context 时整段作为 C1。允许空 cards（002 Compiler 补全）。
 * sectionKey 非法 → null。
 */
export function liftWriteSectionInputToSpec(
  input: WriteSectionInputLike,
): SectionSpecV1 | null {
  const sectionKey = input.sectionKey.trim();
  const register = registerFromSectionKey(sectionKey);
  if (!register || !isSectionSpecKey(sectionKey)) return null;
  const subsectionTitle = input.subsectionTitle?.trim() || undefined;
  const bullets = (input.bullets ?? []).map((b) => b.trim()).filter(Boolean);
  let claimCards = bulletsToClaimCards(bullets);
  if (claimCards.length === 0) {
    const context = input.context?.trim();
    if (context) {
      claimCards = [{ id: "C1", claim: context, evidence: [] }];
    }
  }
  return {
    version: 1,
    sectionKey,
    subsectionTitle,
    register,
    claimCards,
    constraints: defaultConstraintsFor(register, { subsectionTitle }),
    assignedSourceIds: (input.assignedSourceIds ?? []).map((s) => s.trim()).filter(Boolean),
    figureSlots: (input.figureSlots ?? []).map((s) => s.trim()).filter(Boolean),
  };
}

/** Spec → 旧管道 bullets / context，供 009 前过渡 */
export function sectionSpecToWriteDraft(spec: SectionSpecV1): {
  bullets: string[];
  context: string;
} {
  const bullets = spec.claimCards.map((c) => c.claim).filter(Boolean);
  const extra: string[] = [];
  if (spec.subsectionTitle) extra.push(`【子节】${spec.subsectionTitle}`);
  if (spec.claimCards.some((c) => c.warrant)) {
    const warrants = spec.claimCards
      .filter((c) => c.warrant)
      .map((c) => `${c.id}: ${c.warrant}`);
    extra.push(`【推理】${warrants.join("；")}`);
  }
  return { bullets, context: extra.join("\n") };
}
