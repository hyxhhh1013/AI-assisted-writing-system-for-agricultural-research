/**
 * WRITE-QA-004：把 SectionSpec 的 claim cards 钉到项目文献/数据上。
 *
 * 刻意不做「每张 card 再跑一次 RAG」——索引加载贵，N 次检索会把 Writer 上下文打爆。
 * 只在已入库的题录/摘要/dataClaims 上做词重叠，每卡最多 1–3 条。
 */

import type { EvidenceClaim } from "@/contracts/data-source";
import type { SoftReferenceEvidence } from "@/contracts/project";
import type {
  ClaimEvidence,
  SectionClaimCard,
  SectionSpecV1,
} from "@/contracts/section-spec";
import type { WritingQaFinding } from "@/contracts/writing-qa";
import { termOverlapRatio } from "@/lib/citation-grounding";

const MIN_BIND_SCORE = 0.14;
const MAX_REFS_PER_CARD = 3;
const MAX_DATA_PER_CARD = 2;

export interface BindableReference {
  n: number;
  title: string;
  abstract?: string;
  grounded: "full" | "soft";
  sourceName?: string;
}

export interface BindSectionEvidenceInput {
  spec: SectionSpecV1;
  referenceEvidence?: SoftReferenceEvidence[];
  referenceSourceNames?: { refIndex: number; sourceName: string }[];
  /** 项目参考文献行（1 基与 [n] 对齐），无摘要时作题录兜底 */
  references?: string[];
  dataClaims?: EvidenceClaim[];
}

export interface BindSectionEvidenceResult {
  spec: SectionSpecV1;
  boundRefCount: number;
  unboundCardIds: string[];
  /** 项目里有可打分的题录/摘要或结果节 dataClaims */
  hadBindablePool: boolean;
  /** 有文件名的绑中文献；空则不要覆盖原检索范围 */
  selectedSourceIds?: string[];
}

function corpusOf(ref: BindableReference): string {
  return [ref.title, ref.abstract].filter(Boolean).join("\n");
}

export function buildBindableReferencePool(input: {
  referenceEvidence?: SoftReferenceEvidence[];
  referenceSourceNames?: { refIndex: number; sourceName: string }[];
  references?: string[];
}): BindableReference[] {
  const byN = new Map<number, BindableReference>();
  const sourceByIndex = new Map(
    (input.referenceSourceNames ?? []).map((r) => [r.refIndex, r.sourceName.trim()]),
  );

  for (const ev of input.referenceEvidence ?? []) {
    if (!Number.isInteger(ev.index) || ev.index < 1) continue;
    const title = ev.title?.trim() || "";
    const abstract = ev.abstract?.trim() || "";
    if (!title && abstract.length < 40) continue;
    const sourceName = sourceByIndex.get(ev.index);
    byN.set(ev.index, {
      n: ev.index,
      title: title || `文献 [${ev.index}]`,
      abstract: abstract || undefined,
      grounded: sourceName ? "full" : "soft",
      sourceName,
    });
  }

  for (const [idx, sourceName] of sourceByIndex) {
    if (byN.has(idx) || !sourceName) continue;
    const line = input.references?.[idx - 1]?.trim() ?? "";
    if (line.length < 12) continue;
    byN.set(idx, {
      n: idx,
      title: line.slice(0, 180),
      grounded: "full",
      sourceName,
    });
  }

  return [...byN.values()].sort((a, b) => a.n - b.n);
}

function bindRefsForClaim(claim: string, pool: BindableReference[]): ClaimEvidence[] {
  const scored = pool
    .map((ref) => ({ ref, score: termOverlapRatio(claim, corpusOf(ref)) }))
    .filter((row) => row.score >= MIN_BIND_SCORE)
    .sort((a, b) => b.score - a.score || a.ref.n - b.ref.n)
    .slice(0, MAX_REFS_PER_CARD);
  return scored.map((row) => ({
    kind: "ref" as const,
    n: row.ref.n,
    grounded: row.ref.grounded,
  }));
}

function bindDataForClaim(claim: string, dataClaims: EvidenceClaim[]): ClaimEvidence[] {
  if (dataClaims.length === 0) return [];
  const scored = dataClaims
    .filter((c) => typeof c.id === "string" && c.id.trim())
    .map((c) => {
      const text = typeof c.text === "string" ? c.text : "";
      const vars = Array.isArray(c.variables) ? c.variables.filter((v) => typeof v === "string").join(" ") : "";
      return {
        id: c.id,
        score: termOverlapRatio(claim, `${text} ${vars}`.trim()),
      };
    })
    .filter((row) => row.score >= MIN_BIND_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_DATA_PER_CARD);
  return scored.map((row) => ({ kind: "data" as const, id: row.id }));
}

/** 确定性绑定。不调 RAG、不调 LLM。 */
export function bindSectionEvidence(input: BindSectionEvidenceInput): BindSectionEvidenceResult {
  const pool = buildBindableReferencePool(input);
  const dataClaims = input.dataClaims ?? [];
  const cards: SectionClaimCard[] = input.spec.claimCards.map((card) => {
    const evidence = [
      ...bindRefsForClaim(card.claim, pool),
      ...(input.spec.register === "results" ? bindDataForClaim(card.claim, dataClaims) : []),
    ];
    return { ...card, evidence };
  });

  const boundNs = new Set<number>();
  const unboundCardIds: string[] = [];
  for (const card of cards) {
    const refs = card.evidence.filter((e): e is Extract<ClaimEvidence, { kind: "ref" }> => e.kind === "ref");
    if (refs.length === 0 && !card.evidence.some((e) => e.kind === "data")) {
      unboundCardIds.push(card.id);
    }
    for (const e of refs) boundNs.add(e.n);
  }

  const sourceNames = new Set<string>();
  for (const ref of pool) {
    if (boundNs.has(ref.n) && ref.sourceName) sourceNames.add(ref.sourceName);
  }

  const assignedSourceIds =
    sourceNames.size > 0 ? [...sourceNames] : input.spec.assignedSourceIds;

  return {
    spec: { ...input.spec, claimCards: cards, assignedSourceIds },
    boundRefCount: boundNs.size,
    unboundCardIds,
    hadBindablePool:
      pool.length > 0 || (input.spec.register === "results" && dataClaims.length > 0),
    selectedSourceIds: sourceNames.size > 0 ? [...sourceNames] : undefined,
  };
}

/** Writer 只看绑中文献的摘要，避免 formatSoftEvidenceBlock 再倒整库。 */
export function slimReferenceEvidenceForSpec(
  all: SoftReferenceEvidence[] | undefined,
  spec: SectionSpecV1,
): SoftReferenceEvidence[] {
  const list = all ?? [];
  const ns = new Set<number>();
  for (const card of spec.claimCards) {
    for (const e of card.evidence) {
      if (e.kind === "ref") ns.add(e.n);
    }
  }
  if (ns.size === 0) return list;
  const slim = list.filter((ev) => ns.has(ev.index));
  return slim.length > 0 ? slim : list;
}

/** 短表，禁止带摘要。给 Writer 看「只许用这些号」。 */
export function formatEvidenceBindHint(spec: SectionSpecV1): string {
  if (spec.claimCards.length === 0) return "";
  const lines = spec.claimCards.map((card) => {
    const bits = card.evidence.map((e) =>
      e.kind === "ref" ? `[${e.n}]${e.grounded}` : `[${e.id}]`,
    );
    const tail = bits.length > 0 ? bits.join(" ") : "（未绑到文献，不要硬挂 [n]）";
    return `${card.id} ${card.claim.slice(0, 40)} → ${tail}`;
  });
  return [
    "【证据绑定】主张只许引用下列编号；未列出的 [n] 不要用。soft=只可概括，禁止编造该文献精确数据。",
    ...lines,
  ].join("\n");
}

export function evidenceUnboundFinding(
  unboundCardIds: string[],
  opts?: { hadBindablePool?: boolean },
): WritingQaFinding | null {
  if (unboundCardIds.length === 0) return null;
  if (opts && opts.hadBindablePool === false) return null;
  return {
    code: "evidence_unbound",
    layer: "L0",
    action: "warn",
    message: `${unboundCardIds.length} 张主张未绑到文献（${unboundCardIds.join("、")}），勿硬挂 [n]`,
    count: unboundCardIds.length,
    examples: unboundCardIds.slice(0, 3),
  };
}
