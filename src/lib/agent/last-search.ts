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

/**
 * 解析 hitIndices（JSON 数组或逗号/空格分隔的 index，1 起），从最近一次检索结果取命中。
 * 无 hitIndices / 无命中时返回空数组（调用方回退到 hitsJson）。
 */
export function resolveAgentHitIndices(
  raw: unknown,
  userId: string,
): { hits: ExternalLiteratureHit[]; indices: number[] } | { error: string } {
  const nums: number[] = [];
  if (raw == null || raw === "") return { hits: [], indices: [] };

  const push = (v: unknown) => {
    const n = Number(v);
    if (Number.isFinite(n)) nums.push(Math.floor(n));
  };

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

  const storeHits = getLastAgentSearch(userId);
  const unique = [...new Set(nums)];
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
