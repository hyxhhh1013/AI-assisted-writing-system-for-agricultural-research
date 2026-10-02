import type { ExternalLiteratureHit } from "@/contracts/literature";

/**
 * 最近一次 search_external 的命中（按 userId），供 import_reference(hitIndices) 复用。
 *
 * 背景：Agent 若要把 15 篇文献批量导入，得在 import_reference 里重贴整段 hitsJson。
 * 而 hitsJson 含全文/摘要（单条可达几千字符），15 条会超过模型单次工具调用的输出上限，
 * 模型只能截断成几篇——这是"一次只能导入几篇"的另一个根因。
 * 解决：search_external 把命中存这里；Agent 用 hitIndices=[1,2,...15]（小参数）引用即可。
 *
 * 注意：进程内内存，服务器重启即清空；Agent 在"先检索后导入"的同一会话内使用没问题。
 */

const MAX_KEPT = 25;
const store = new Map<string, ExternalLiteratureHit[]>();

/** 最近一次 search_knowledge 按文件去重后的命中，供 import_reference(knowledgeHitIndices) */
export interface KnowledgeSearchHit {
  source: string;
  category?: string;
  citation?: string;
  excerpt?: string;
  relevanceScore?: number;
  why?: string;
}

const knowledgeStore = new Map<string, KnowledgeSearchHit[]>();
export const KNOWLEDGE_HIT_ID_PREFIX = "kb:";

export function storeLastAgentSearch(
  userId: string,
  hits: ExternalLiteratureHit[],
): void {
  store.set(userId, hits.slice(0, MAX_KEPT));
}

export function getLastAgentSearch(userId: string): ExternalLiteratureHit[] {
  return store.get(userId) ?? [];
}

export function clearLastAgentSearch(userId: string): void {
  store.delete(userId);
}

function knowledgeHitKey(source: string): string {
  const t = source.replace(/\\/g, "/").trim();
  return (t.split("/").pop() ?? t).toLowerCase();
}

export function storeLastKnowledgeSearch(
  userId: string,
  hits: KnowledgeSearchHit[],
): void {
  knowledgeStore.set(userId, hits.slice(0, MAX_KEPT));
}

/** 多轮检索合并：同文件保留相关度更高的一条，按分排序。 */
export function mergeLastKnowledgeSearch(
  userId: string,
  hits: KnowledgeSearchHit[],
): KnowledgeSearchHit[] {
  const prev = knowledgeStore.get(userId) ?? [];
  const byKey = new Map<string, KnowledgeSearchHit>();
  for (const h of [...prev, ...hits]) {
    const key = knowledgeHitKey(h.source);
    if (!key) continue;
    const old = byKey.get(key);
    if (!old || (h.relevanceScore ?? 0) >= (old.relevanceScore ?? 0)) {
      byKey.set(key, h);
    }
  }
  const merged = [...byKey.values()]
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
    .slice(0, MAX_KEPT);
  knowledgeStore.set(userId, merged);
  return merged;
}

export function getLastKnowledgeSearch(userId: string): KnowledgeSearchHit[] {
  return knowledgeStore.get(userId) ?? [];
}

export function clearLastKnowledgeSearch(userId: string): void {
  knowledgeStore.delete(userId);
}

export function isKnowledgeHitId(id: string | undefined): boolean {
  return Boolean(id?.startsWith(KNOWLEDGE_HIT_ID_PREFIX));
}

export function knowledgeSourceFromHitId(id: string): string | null {
  if (!isKnowledgeHitId(id)) return null;
  const raw = id.slice(KNOWLEDGE_HIT_ID_PREFIX.length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw || null;
  }
}

export function knowledgeHitToExternal(hit: KnowledgeSearchHit): ExternalLiteratureHit {
  const title =
    (hit.citation ?? "").replace(/^\[\d+\]\s*/, "").trim()
    || hit.source.replace(/\.pdf$/i, "").trim()
    || hit.source;
  return {
    id: `${KNOWLEDGE_HIT_ID_PREFIX}${encodeURIComponent(hit.source)}`,
    title,
    authors: [],
    journal: hit.category ? `本地知识库/${hit.category}` : "本地知识库 PDF",
    source: "openalex",
    abstract: hit.excerpt,
  };
}

function parseIndexList(raw: unknown): number[] {
  const nums: number[] = [];
  const push = (v: unknown) => {
    const n = Number(v);
    if (Number.isFinite(n)) nums.push(Math.floor(n));
  };
  if (raw == null || raw === "") return [];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) parsed.forEach(push);
      else push(parsed);
    } catch {
      trimmed
        .split(/[,，\s]+/)
        .filter(Boolean)
        .forEach(push);
    }
  } else if (Array.isArray(raw)) {
    raw.forEach(push);
  } else {
    push(raw);
  }
  return [...new Set(nums)];
}

/**
 * 解析 hitIndices（JSON 数组或逗号/空格分隔的 index，1 起），从最近一次检索结果取命中。
 * 无 hitIndices / 无命中时返回空数组（调用方回退到 hitsJson）。
 */
export function resolveAgentHitIndices(
  raw: unknown,
  userId: string,
): { hits: ExternalLiteratureHit[]; indices: number[] } | { error: string } {
  if (raw == null || raw === "") return { hits: [], indices: [] };
  const unique = parseIndexList(raw);
  const storeHits = getLastAgentSearch(userId);
  const out: ExternalLiteratureHit[] = [];
  for (const idx of unique) {
    const hit = storeHits[idx - 1]; // search_external 的 index 为 1 起
    if (hit) out.push(hit);
  }
  if (unique.length > 0 && out.length === 0) {
    return {
      error:
        "hitIndices 超出最近检索结果范围。请先 search_external，再按返回的 items[].index 导入。",
    };
  }
  return { hits: out, indices: unique };
}

export function resolveKnowledgeHitIndices(
  raw: unknown,
  userId: string,
): { hits: KnowledgeSearchHit[]; indices: number[] } | { error: string } {
  if (raw == null || raw === "") return { hits: [], indices: [] };
  const unique = parseIndexList(raw);
  const storeHits = getLastKnowledgeSearch(userId);
  const out: KnowledgeSearchHit[] = [];
  for (const idx of unique) {
    const hit = storeHits[idx - 1];
    if (hit) out.push(hit);
  }
  if (unique.length > 0 && out.length === 0) {
    return {
      error:
        "knowledgeHitIndices 超出最近一次 search_knowledge 结果。请先检索本地库，再按 files[].index 导入。",
    };
  }
  return { hits: out, indices: unique };
}
