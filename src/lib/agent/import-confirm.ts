/**
 * import_reference 确认候选解析。
 *
 * 背景：Agent 自动收集到多篇文献后，确认卡之前只能按模型传入的单篇/单次请求导入，
 * 导致「收集到很多、确认导入却一次一篇」。这里把确认卡扩展为「候选列表 + 勾选」：
 * - 候选 = 模型请求导入的 hits（hitIndices→last-search / hitsJson / hitJson / doi）∪ 最近一次检索的全部命中（去重）
 * - 确认时注入 `params.importItems`；前端勾选后回传 `selectedIndices`，服务端按勾选批量落库
 */

import type { ExternalLiteratureHit } from "@/contracts/literature";
import { externalLiteratureHitSchema } from "@/lib/validations";
import { searchExternalLiterature } from "@/lib/literature-search";
import { getLastAgentSearch } from "@/lib/agent/last-search";
import { enrichImportReferenceParams } from "@/lib/agent/literature-relevance";
import { coerceExternalHitCandidate } from "@/lib/agent/tools/import-reference";
import type { AgentContext } from "@/lib/agent/types";

/** 确认卡候选上限（last-search store 上限 25） */
export const MAX_IMPORT_ITEMS = 25;

function parseJsonArr(raw: unknown): unknown[] | null {
  let v = raw;
  if (typeof v === "string") {
    const t = v.trim();
    // 偶发双重 JSON 编码：'"[{...}]"'
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      try {
        v = JSON.parse(t);
      } catch {
        /* keep original */
      }
    }
    try {
      v = JSON.parse(String(v));
    } catch {
      return null;
    }
    if (typeof v === "string") {
      try {
        v = JSON.parse(v);
      } catch {
        return null;
      }
    }
  }
  return Array.isArray(v) ? v : null;
}

/** 解析 hitsJson / hitJsons（与 import_reference 工具同源逻辑） */
export function parseModelHitsJson(params: Record<string, unknown>): ExternalLiteratureHit[] {
  const raw = params.hitsJson ?? params.hitJsons;
  if (raw == null || raw === "") return [];
  const arr = parseJsonArr(raw);
  if (!arr) return [];
  const out: ExternalLiteratureHit[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    // 允许直接 hit 对象，或 { hitJson: "..." }
    let candidate: unknown = item;
    if (item && typeof item === "object" && "hitJson" in (item as object)) {
      try {
        candidate = JSON.parse(String((item as { hitJson: unknown }).hitJson));
      } catch {
        continue;
      }
    }
    const result = externalLiteratureHitSchema.safeParse(coerceExternalHitCandidate(candidate));
    if (result.success) out.push(result.data);
  }
  return out;
}

/** 解析单篇 hitJson */
function parseModelHitJson(params: Record<string, unknown>): ExternalLiteratureHit | null {
  if (params.hitJson == null) return null;
  try {
    const parsed = JSON.parse(String(params.hitJson)) as unknown;
    const result = externalLiteratureHitSchema.safeParse(coerceExternalHitCandidate(parsed));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function parseIndices(raw: unknown): number[] {
  const nums: number[] = [];
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
  return [...new Set(nums)];
}

/** 模型请求导入的 hits：hitIndices → last-search；hitsJson / hitJson / doi 兜底 */
export async function resolveRequestedHits(
  params: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ExternalLiteratureHit[]> {
  const fromHitsJson = parseModelHitsJson(params);
  if (fromHitsJson.length > 0) return fromHitsJson;

  const store = getLastAgentSearch(ctx.userId);
  if (params.hitIndices != null && String(params.hitIndices).trim()) {
    const indices = parseIndices(params.hitIndices);
    const out: ExternalLiteratureHit[] = [];
    for (const idx of indices) {
      const hit = store[idx - 1]; // search_external 的 index 为 1 起
      if (hit) out.push(hit);
    }
    if (out.length > 0) return out;
  }

  const single = parseModelHitJson(params);
  if (single) return [single];

  const doi = String(params.doi ?? "").trim();
  if (doi) {
    const found = await searchExternalLiterature(doi, { limit: 3 });
    if (found[0]) return [found[0]];
  }
  return [];
}

function hitKey(h: ExternalLiteratureHit): string {
  return (
    h.id
    || (h.doi ? `doi:${h.doi.trim().toLowerCase()}` : h.title?.trim().toLowerCase())
    || ""
  );
}

/**
 * 确认卡候选：模型请求的 hits ∪ 最近一次检索的全部命中（去重，≤ MAX_IMPORT_ITEMS）。
 * 这样「agent 收集到很多」时，确认卡能列出全部，用户一次勾选批量导入。
 */
export async function resolveImportReferenceCandidates(
  params: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ExternalLiteratureHit[]> {
  const out: ExternalLiteratureHit[] = [];
  const seen = new Set<string>();
  const push = (h: ExternalLiteratureHit) => {
    const key = hitKey(h);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(h);
  };

  const requested = await resolveRequestedHits(params, ctx);
  for (const h of requested) push(h);

  const store = getLastAgentSearch(ctx.userId);
  for (const h of store) push(h);

  return out.slice(0, MAX_IMPORT_ITEMS);
}

/** 注入 importItems 的确认参数（在原 enrichImportReferenceParams 之上） */
export async function buildImportReferenceConfirmParams(
  params: Record<string, unknown>,
  ctx: AgentContext,
): Promise<Record<string, unknown>> {
  const enriched = enrichImportReferenceParams(params);
  const items = await resolveImportReferenceCandidates(params, ctx);
  if (items.length === 0) return enriched;
  return { ...enriched, importItems: items };
}
