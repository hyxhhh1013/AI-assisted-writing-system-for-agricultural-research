import type { KnowledgeDoiFilter, KnowledgeIndexStatusFilter } from "@/contracts/knowledge";

const INDEX_STATUS = new Set<KnowledgeIndexStatusFilter>(["all", "unindexed", "partial", "ready"]);
const DOI_FILTER = new Set<KnowledgeDoiFilter>(["all", "has", "missing"]);

export interface KnowledgeListUrlState {
  page: number;
  q: string;
  category: string;
  searchType: "name" | "semantic";
  journal: string;
  indexStatus: KnowledgeIndexStatusFilter;
  doi: KnowledgeDoiFilter;
}

function readPage(raw: string | null): number {
  if (!raw) return 1;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function readIndexStatus(raw: string | null): KnowledgeIndexStatusFilter {
  return raw && INDEX_STATUS.has(raw as KnowledgeIndexStatusFilter)
    ? (raw as KnowledgeIndexStatusFilter)
    : "all";
}

function readDoi(raw: string | null): KnowledgeDoiFilter {
  return raw && DOI_FILTER.has(raw as KnowledgeDoiFilter) ? (raw as KnowledgeDoiFilter) : "all";
}

/** 从地址栏恢复知识库列表。缺省值与页面初始状态一致。 */
export function readKnowledgeListUrl(params: URLSearchParams): KnowledgeListUrlState {
  const category = params.get("category")?.trim() || "全部";
  return {
    page: readPage(params.get("page")),
    q: params.get("q") ?? "",
    category,
    searchType: params.get("type") === "semantic" ? "semantic" : "name",
    journal: params.get("journal") ?? "",
    indexStatus: readIndexStatus(params.get("index")),
    doi: readDoi(params.get("doi")),
  };
}

export function knowledgeListHasBibFilters(state: Pick<KnowledgeListUrlState, "journal" | "indexStatus" | "doi">): boolean {
  return Boolean(state.journal.trim() || state.indexStatus !== "all" || state.doi !== "all");
}

/** 筛选条件指纹。只有它变了才回到第 1 页，翻页和刷新列表不算。 */
export function knowledgeListFilterKey(
  state: Pick<KnowledgeListUrlState, "q" | "category" | "searchType" | "journal" | "indexStatus" | "doi">,
): string {
  return [state.q, state.category, state.searchType, state.journal, state.indexStatus, state.doi].join("\0");
}

/**
 * 把列表状态写回查询串，并保留本页不拥有的参数（如 projectId）。
 * 默认值不写入，避免地址栏堆满 page=1。
 */
export function applyKnowledgeListUrl(current: URLSearchParams, state: KnowledgeListUrlState): string {
  const next = new URLSearchParams(current.toString());
  const set = (key: string, value: string | null) => {
    if (!value) next.delete(key);
    else next.set(key, value);
  };
  set("page", state.page > 1 ? String(state.page) : null);
  set("q", state.q.trim() ? state.q : null);
  set("category", state.category && state.category !== "全部" ? state.category : null);
  set("type", state.searchType === "semantic" ? "semantic" : null);
  set("journal", state.journal.trim() ? state.journal : null);
  set("index", state.indexStatus !== "all" ? state.indexStatus : null);
  set("doi", state.doi !== "all" ? state.doi : null);
  return next.toString();
}
