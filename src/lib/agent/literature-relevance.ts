/**
 * W3-AP-LIT-QUALITY — 文献与查询的轻量相关度（无 LLM）
 */

/** 低于此分且无 DOI 精确命中时，劝阻 / 拒绝导入 */
export const MIN_IMPORT_RELEVANCE = 0.12;

const STOP = new Set([
  "the", "a", "an", "of", "and", "or", "in", "on", "for", "to", "with",
  "的", "与", "和", "及", "对", "中", "研究", "分析", "基于", "关于",
]);

export function tokenizeQuery(query: string): string[] {
  const raw = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t));
  // 中文连续字：再拆 2-gram
  const extra: string[] = [];
  for (const t of raw) {
    if (/[\u4e00-\u9fff]/.test(t) && t.length >= 2) {
      for (let i = 0; i < t.length - 1; i++) {
        extra.push(t.slice(i, i + 2));
      }
    }
  }
  return [...new Set([...raw, ...extra])];
}

function haystack(hit: {
  title?: string;
  journal?: string;
  abstract?: string;
  doi?: string;
}): string {
  return [hit.title, hit.journal, hit.abstract?.slice(0, 400), hit.doi]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export interface LiteratureRelevance {
  /** 0～1 */
  score: number;
  /** 给人看的短理由 */
  why: string;
  matchedTokens: string[];
}

export function scoreLiteratureRelevance(
  query: string,
  hit: {
    title?: string;
    journal?: string;
    abstract?: string;
    doi?: string;
  },
): LiteratureRelevance {
  const q = query.trim();
  if (!q) {
    return { score: 0, why: "无检索词，无法评估相关度", matchedTokens: [] };
  }

  // DOI / 精确标题查询
  const doiInQuery = q.match(/10\.\d{4,}\/\S+/i)?.[0];
  if (doiInQuery && hit.doi && hit.doi.toLowerCase().includes(doiInQuery.toLowerCase())) {
    return {
      score: 1,
      why: `DOI 与查询一致（${doiInQuery}）`,
      matchedTokens: [doiInQuery],
    };
  }

  const tokens = tokenizeQuery(q);
  if (tokens.length === 0) {
    return { score: 0.2, why: "查询词过短，相关度仅供参考", matchedTokens: [] };
  }

  const text = haystack(hit);
  const title = (hit.title ?? "").toLowerCase();
  const matched: string[] = [];
  let weight = 0;
  let maxWeight = 0;

  for (const tok of tokens) {
    const w = tok.length >= 4 ? 1.2 : 1;
    maxWeight += w;
    if (title.includes(tok)) {
      matched.push(tok);
      weight += w * 1.5;
    } else if (text.includes(tok)) {
      matched.push(tok);
      weight += w;
    }
  }

  const raw = maxWeight > 0 ? weight / (maxWeight * 1.5) : 0;
  const score = Math.min(1, Math.round(raw * 100) / 100);

  const why =
    matched.length > 0
      ? `标题/摘要命中：${matched.slice(0, 6).join("、")}`
      : "未命中查询关键词，相关度偏低，导入前请说明理由";

  return { score, why, matchedTokens: matched };
}

export function isRelevanceAcceptable(
  score: number,
  opts?: { hasWhy?: boolean; doiLookup?: boolean },
): boolean {
  if (opts?.doiLookup) return true;
  if (score >= MIN_IMPORT_RELEVANCE) return true;
  // 低相关但仍允许：必须有人工 why
  return Boolean(opts?.hasWhy);
}

export function parseWhyParam(raw: unknown): string {
  return String(raw ?? "").trim();
}

/**
 * 确认卡弹出前：补全 query/why/relevanceScore，避免工具未执行时缺相关度信息
 */
export function enrichImportReferenceParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const hitJson = params.hitJson != null ? String(params.hitJson) : "";
  const doi = String(params.doi ?? "").trim();
  let title = "";
  let hit: {
    title?: string;
    journal?: string;
    abstract?: string;
    doi?: string;
  } | null = null;

  if (hitJson) {
    try {
      hit = JSON.parse(hitJson) as {
        title?: string;
        journal?: string;
        abstract?: string;
        doi?: string;
      };
      title = (hit.title ?? "").trim();
    } catch {
      hit = null;
    }
  }

  const query = String(params.query ?? "").trim() || doi || title;
  const existingWhy = parseWhyParam(params.why);
  let relevanceScore =
    typeof params.relevanceScore === "number"
      ? params.relevanceScore
      : Number.isFinite(Number(params.relevanceScore))
        ? Number(params.relevanceScore)
        : null;

  let autoWhy = "";
  if (hit && query) {
    const rel = scoreLiteratureRelevance(query, hit);
    autoWhy = rel.why;
    if (relevanceScore == null) relevanceScore = rel.score;
  }

  // why 只保留人工/模型填写（≥8 字）；autoWhy 仅供确认卡展示，不得充当 hasWhy
  return {
    ...params,
    ...(query ? { query } : {}),
    why: existingWhy.length >= 8 ? existingWhy : "",
    ...(autoWhy ? { autoWhy } : {}),
    ...(relevanceScore != null ? { relevanceScore } : {}),
  };
}
