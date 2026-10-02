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
import {
  CITATION_GROUP_RE,
  expandCitationGroup,
  normalizeAllCitationFormats,
} from "@/lib/citation";
import { collectionWeightedScores, termOverlapRatio } from "@/lib/citation-grounding";

const MIN_BIND_SCORE = 0.14;
const MAX_REFS_PER_CARD = 3;
const MAX_DATA_PER_CARD = 2;
/** 分接近时视为并列，优先尚未绑过的编号，避免 50 篇综述全挤在 [1][2][3] */
const BIND_SCORE_TIE = 0.04;
/** Writer 摘要池：绑中文献 + 主题相近补位上限 */
const MAX_SLIM_EVIDENCE = 14;

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

function bindRefsForClaim(
  claim: string,
  pool: BindableReference[],
  usedNs: Set<number>,
): ClaimEvidence[] {
  const corpora = pool.map((ref) => corpusOf(ref));
  const idfScores = collectionWeightedScores(claim, corpora);
  const scored = pool
    .map((ref, i) => ({
      ref,
      score: Math.max(idfScores[i] ?? 0, termOverlapRatio(claim, corpora[i] ?? "")),
    }))
    .filter((row) => row.score >= MIN_BIND_SCORE)
    .sort((a, b) => {
      const d = b.score - a.score;
      if (Math.abs(d) > BIND_SCORE_TIE) return d;
      const usedA = usedNs.has(a.ref.n) ? 1 : 0;
      const usedB = usedNs.has(b.ref.n) ? 1 : 0;
      if (usedA !== usedB) return usedA - usedB;
      return a.ref.n - b.ref.n;
    });

  const picked: typeof scored = [];
  for (const row of scored) {
    if (picked.length >= MAX_REFS_PER_CARD) break;
    if (usedNs.has(row.ref.n)) {
      const unused = scored.find(
        (x) =>
          !usedNs.has(x.ref.n)
          && !picked.some((p) => p.ref.n === x.ref.n)
          && x.score >= row.score - 0.08,
      );
      if (unused) continue;
    }
    picked.push(row);
    usedNs.add(row.ref.n);
  }

  return picked.map((row) => ({
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
  const usedNs = new Set<number>();
  const cards: SectionClaimCard[] = input.spec.claimCards.map((card) => {
    const evidence = [
      ...bindRefsForClaim(card.claim, pool, usedNs),
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
  const bound = list.filter((ev) => ns.has(ev.index));
  if (bound.length === 0) return list;
  if (bound.length >= MAX_SLIM_EVIDENCE) {
    return bound.sort((a, b) => a.index - b.index).slice(0, MAX_SLIM_EVIDENCE);
  }

  const claimBlob = spec.claimCards.map((c) => c.claim).join("\n");
  const extra = list
    .filter((ev) => !ns.has(ev.index) && (ev.title || ev.abstract))
    .map((ev) => ({
      ev,
      score: termOverlapRatio(claimBlob, `${ev.title ?? ""}\n${ev.abstract ?? ""}`),
    }))
    .filter((row) => row.score >= MIN_BIND_SCORE * 0.7)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SLIM_EVIDENCE - bound.length)
    .map((row) => row.ev);

  return [...bound, ...extra].sort((a, b) => a.index - b.index);
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
    "【证据绑定】优先引用下列编号。每条 [n] 必须与该条题录主题相符，禁止把 [1][2] 当通用综述。综述还可概括引用项目参考文献里其它有摘要/全文的 [n]，勿编造精确数据。soft=只可概括。",
    ...lines,
  ].join("\n");
}

export function boundRefNumbers(spec: SectionSpecV1 | null | undefined): number[] {
  if (!spec) return [];
  const ns = new Set<number>();
  for (const card of spec.claimCards) {
    for (const e of card.evidence) {
      if (e.kind === "ref") ns.add(e.n);
    }
  }
  return [...ns].sort((a, b) => a - b);
}

/** 正文 [n] 不在已绑编号内（全未绑时任意 [n] 都不许）。 */
export function draftHasDisallowedCitations(
  draftText: string | undefined,
  allowedCiteNs: readonly number[] | undefined,
): boolean {
  if (!draftText) return false;
  const allowed = new Set(allowedCiteNs ?? []);
  const normalized = normalizeAllCitationFormats(draftText);
  const re = new RegExp(CITATION_GROUP_RE.source, CITATION_GROUP_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    for (const n of expandCitationGroup(m[1])) {
      if (n >= 1 && !allowed.has(n)) return true;
    }
  }
  return false;
}

export function evidenceUnboundFinding(
  unboundCardIds: string[],
  opts?: {
    hadBindablePool?: boolean;
    draftText?: string;
    allowedCiteNs?: readonly number[];
  },
): WritingQaFinding | null {
  if (unboundCardIds.length === 0) return null;
  if (opts && opts.hadBindablePool === false) return null;
  const hanging = draftHasDisallowedCitations(opts?.draftText, opts?.allowedCiteNs);
  return {
    code: "evidence_unbound",
    layer: "L0",
    action: hanging ? "repair" : "warn",
    message: hanging
      ? `${unboundCardIds.length} 张主张未绑到文献（${unboundCardIds.join("、")}），正文硬挂了未绑 [n]，禁止写回`
      : `${unboundCardIds.length} 张主张未绑到文献（${unboundCardIds.join("、")}），勿硬挂 [n]`,
    count: unboundCardIds.length,
    examples: unboundCardIds.slice(0, 3),
  };
}
