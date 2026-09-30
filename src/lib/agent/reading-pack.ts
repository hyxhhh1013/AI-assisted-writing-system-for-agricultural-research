import type { SoftReferenceEvidence } from "@/contracts/project";
import type { SectionSpecV1 } from "@/contracts/section-spec";
import { slimReferenceEvidenceForSpec } from "@/lib/agent/evidence-binder";

export type ReadingDepth = "abstract" | "full";

export interface ReadingPackEntry {
  n: number;
  depth: ReadingDepth;
  sourceName?: string;
}

export interface ReadingPackHost {
  readingPack?: ReadingPackEntry[];
  projectSnapshot?: {
    referenceSourceNames?: { refIndex: number; sourceName: string }[];
  } | null;
}

export const MAX_READING_PACK = 12;
export const MAX_FULL_READS = 4;
/** 整节写入 Writer 的摘要条数上限 */
export const MAX_WRITER_PACK_EVIDENCE = 6;
/** 子节 / 单点扩写更短，避免把整包摘要每节塞一遍 */
export const MAX_SLICE_EVIDENCE = 5;
export const MAX_RAG_SOURCES_PER_WRITE = 4;
export const SLICE_ABSTRACT_CHARS = 420;

const HEAVY_READ_MIN: Record<string, number> = {
  literature_body: 4,
  introduction: 4,
  discussion: 4,
  background: 4,
};

export function basenameKey(name: string): string {
  const t = name.replace(/\\/g, "/").trim();
  const leaf = t.split("/").pop() ?? t;
  return leaf.toLowerCase();
}

export function resolveRefIndexBySourceKey(
  sourceKey: string,
  names?: { refIndex: number; sourceName: string }[] | null,
): number | undefined {
  const key = basenameKey(sourceKey);
  if (!key) return undefined;
  const hit = names?.find((r) => basenameKey(r.sourceName) === key);
  return hit?.refIndex;
}

export function normalizeReadingPack(raw: unknown): ReadingPackEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ReadingPackEntry[] = [];
  const seen = new Set<number>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const n = Number((row as ReadingPackEntry).n);
    if (!Number.isFinite(n) || n < 1) continue;
    const depth = (row as ReadingPackEntry).depth === "full" ? "full" : "abstract";
    const sourceName = String((row as ReadingPackEntry).sourceName ?? "").trim() || undefined;
    const existing = out.find((e) => e.n === n);
    if (existing) {
      if (existing.depth === "abstract" && depth === "full") existing.depth = "full";
      if (!existing.sourceName && sourceName) existing.sourceName = sourceName;
      continue;
    }
    if (seen.has(n)) continue;
    seen.add(n);
    out.push({ n, depth, sourceName });
    if (out.length >= MAX_READING_PACK) break;
  }
  return out;
}

export function ensureReadingPack(ctx: ReadingPackHost): ReadingPackEntry[] {
  if (!ctx.readingPack) ctx.readingPack = [];
  return ctx.readingPack;
}

export function recordReferenceRead(
  ctx: ReadingPackHost,
  n: number,
  depth: ReadingDepth,
  sourceName?: string,
): void {
  if (!Number.isFinite(n) || n < 1) return;
  const pack = ensureReadingPack(ctx);
  const i = pack.findIndex((e) => e.n === n);
  if (i < 0) {
    if (pack.length >= MAX_READING_PACK) return;
    if (depth === "full" && !canRecordFullRead(ctx)) return;
    pack.push({ n, depth, sourceName: sourceName?.trim() || undefined });
    return;
  }
  if (pack[i].depth === "abstract" && depth === "full") {
    if (!canRecordFullRead(ctx, n)) return;
    pack[i].depth = "full";
  }
  if (!pack[i].sourceName && sourceName?.trim()) pack[i].sourceName = sourceName.trim();
}

export function recordSourceKeyRead(
  ctx: ReadingPackHost,
  sourceKey: string,
  depth: ReadingDepth,
): void {
  const n = resolveRefIndexBySourceKey(sourceKey, ctx.projectSnapshot?.referenceSourceNames);
  if (n == null) return;
  recordReferenceRead(ctx, n, depth, sourceKey);
}

export function fullReadCount(ctx: ReadingPackHost): number {
  return (ctx.readingPack ?? []).filter((e) => e.depth === "full").length;
}

export function canRecordFullRead(ctx: ReadingPackHost, n?: number): boolean {
  if (n != null) {
    const existing = ctx.readingPack?.find((e) => e.n === n);
    if (existing?.depth === "full") return true;
  }
  return fullReadCount(ctx) < MAX_FULL_READS;
}

export function fullReadBudgetError(ctx: ReadingPackHost, n?: number): string | null {
  if (canRecordFullRead(ctx, n)) return null;
  return (
    `本会话全文精读已达 ${MAX_FULL_READS} 篇上限。后续子节复用阅读包，用 read_reference 摘要或直接 write_section，`
    + "不要每个小点再 read_full_text。"
  );
}

export function readingPackIndices(ctx: ReadingPackHost): Set<number> {
  return new Set((ctx.readingPack ?? []).map((e) => e.n));
}

export function readingPackSourceKeys(ctx: ReadingPackHost): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of ctx.readingPack ?? []) {
    if (!e.sourceName) continue;
    const k = basenameKey(e.sourceName);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e.sourceName);
  }
  return out;
}

export function minReadsForSection(section: string): number {
  return HEAVY_READ_MIN[section] ?? 0;
}

/**
 * 会话级门槛：全章精读一次即可，后续子节复用 pack，不要每个小点再读一轮。
 */
export function readingPackGateError(opts: {
  section: string;
  withAbstract: number;
  packCount: number;
}): string | null {
  const want = minReadsForSection(opts.section);
  if (want <= 0) return null;
  if (opts.withAbstract < 8) return null;
  const need = Math.min(want, opts.withAbstract, MAX_READING_PACK);
  if (opts.packCount >= need) return null;
  return (
    `写 ${opts.section} 前本会话先精读约 ${need} 篇即可（list_references → read_reference；全文最多 ${MAX_FULL_READS} 篇）。`
    + `当前精读 ${opts.packCount} 篇。后续子节复用阅读包，不要每节重读。`
  );
}

function clipAbstracts(
  rows: SoftReferenceEvidence[],
  maxAbs: number,
): SoftReferenceEvidence[] {
  return rows.map((e) => {
    const abs = e.abstract ?? "";
    if (abs.length <= maxAbs) return e;
    return { ...e, abstract: `${abs.slice(0, maxAbs)}…` };
  });
}

export function mergePackWithSlimEvidence(
  all: SoftReferenceEvidence[] | undefined,
  spec: SectionSpecV1 | null,
  packNs: Set<number>,
  opts?: { slice?: boolean },
): SoftReferenceEvidence[] {
  const list = all ?? [];
  const cap = opts?.slice ? MAX_SLICE_EVIDENCE : MAX_WRITER_PACK_EVIDENCE;
  const slim = spec ? slimReferenceEvidenceForSpec(list, spec) : [];
  const slimInPack = slim.filter((e) => packNs.has(e.index));
  const slimRest = slim.filter((e) => !packNs.has(e.index));
  const packOnly = packNs.size === 0
    ? []
    : list.filter(
        (e) => packNs.has(e.index) && !slim.some((s) => s.index === e.index),
      );

  const ordered =
    packNs.size === 0
      ? (spec ? slim : list)
      : [...slimInPack, ...slimRest, ...packOnly];

  const seen = new Set<number>();
  const out: SoftReferenceEvidence[] = [];
  for (const e of ordered) {
    if (seen.has(e.index)) continue;
    seen.add(e.index);
    out.push(e);
    if (out.length >= cap) break;
  }
  return clipAbstracts(out, opts?.slice ? SLICE_ABSTRACT_CHARS : 800);
}

export function mergeRagSourceIds(
  selectedSourceIds: string[] | undefined,
  packKeys: string[],
): string[] | undefined {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const id of [...packKeys, ...(selectedSourceIds ?? [])]) {
    const t = id.trim();
    if (!t) continue;
    const k = basenameKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(t);
    if (merged.length >= MAX_RAG_SOURCES_PER_WRITE) break;
  }
  return merged.length > 0 ? merged : undefined;
}
