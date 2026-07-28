import { scoreLiteratureRelevance } from "@/lib/agent/literature-relevance";
import { searchExternalLiteratureWithStats } from "@/lib/literature-search";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import type { ExternalLiteratureHit } from "@/contracts/literature";

/** 保留摘要供入库 soft-grounded；过长截断以免确认卡/消息过大 */
function toImportableHit(hit: ExternalLiteratureHit): ExternalLiteratureHit {
  const abstract = hit.abstract?.replace(/\s+/g, " ").trim();
  return {
    id: hit.id,
    title: hit.title,
    authors: hit.authors,
    year: hit.year,
    journal: hit.journal,
    volume: hit.volume,
    issue: hit.issue,
    pages: hit.pages,
    doi: hit.doi,
    url: hit.url,
    citedByCount: hit.citedByCount,
    openAccessUrl: hit.openAccessUrl,
    isOpenAccess: hit.isOpenAccess,
    source: hit.source,
    sources: hit.sources,
    ...(abstract ? { abstract: abstract.slice(0, 4000) } : {}),
  };
}

export const searchExternalTool: ToolDefinition = {
  name: "search_external",
  description:
    "在外部数据库检索学术文献（OpenAlex/S2，不足再补 CrossRef/PubMed；中文自动转英文同义）。"
    + "返回按相关度排序的 items。单次尽量 limit=20～25，少换 query；多篇用 import_reference(hitsJson=...)",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "检索关键词或 DOI（中英文均可；中文会自动补英文）" },
      limit: { type: "number", description: "返回条数，默认 20，最大 25" },
    },
    required: ["query"],
  },
  safety: "read",
  async execute(params, _ctx: AgentContext) {
    const query = String(params.query ?? "").trim();
    if (!query) {
      return { success: false, error: "query 不能为空" };
    }

    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 25);
    const { hits, variants, sourceCounts } = await searchExternalLiteratureWithStats(query, {
      limit,
      mode: "fast",
    });

    if (hits.length === 0) {
      const srcHint = Object.entries(sourceCounts)
        .map(([k, v]) => `${k}:${v}`)
        .join(", ");
      return {
        success: false,
        error:
          `外部检索「${query}」无命中（源计数 ${srcHint || "全部失败"}）。`
          + `可换英文关键词（如 biochar pyrolysis）、缩短查询，或检查网络。`,
        data: { query, variants, sourceCounts, count: 0, items: [] },
      };
    }

    const ranked = hits
      .map((h) => {
        const rel = scoreLiteratureRelevance(query, h);
        const importable = toImportableHit(h);
        return {
          title: h.title,
          authors: h.authors?.slice(0, 5),
          year: h.year,
          journal: h.journal,
          doi: h.doi,
          isOpenAccess: h.isOpenAccess,
          source: h.source,
          relevanceScore: rel.score,
          why: rel.why,
          hitJson: JSON.stringify(importable),
          _score: rel.score,
        };
      })
      .sort((a, b) => b._score - a._score)
      .map(({ _score, ...rest }, i) => ({ index: i + 1, ...rest }));

    const top = ranked[0];
    const hint = top
      ? `最相关：#${top.index}「${String(top.title).slice(0, 40)}」score=${top.relevanceScore}`
      : "无命中";

    /** 单次建议批量导入量（与 import_reference MAX_BATCH 对齐） */
    const topN = Math.min(15, ranked.length);
    const hitsJsonHint = JSON.stringify(
      ranked.slice(0, topN).map((r) => JSON.parse(String(r.hitJson))),
    );

    return {
      success: true,
      data: {
        query,
        variants,
        sourceCounts,
        count: ranked.length,
        items: ranked,
        /** 便于 Agent 一次导入 Top-N */
        suggestedHitsJson: hitsJsonHint,
        suggestedCount: topN,
      },
      summary:
        `外部检索「${query}」返回 ${ranked.length} 篇（已按相关度排序）。${hint}。`
        + `建议一次导入 Top ${topN}：import_reference(hitsJson=data.suggestedHitsJson, query, why)。`
        + (ranked.length > topN
          ? `其余可换 query 再搜，综述目标通常 ≥30 篇。`
          : ""),
    };
  },
};
