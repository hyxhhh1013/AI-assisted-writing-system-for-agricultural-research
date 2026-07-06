import { searchExternalLiterature } from "@/lib/literature-search";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

export const searchExternalTool: ToolDefinition = {
  name: "search_external_literature",
  description: "在外部数据库（OpenAlex/Crossref 等）检索学术文献",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "检索关键词或 DOI" },
      limit: { type: "number", description: "返回条数，默认 10，最大 25" },
    },
    required: ["query"],
  },
  safety: "read",
  async execute(params, _ctx: AgentContext) {
    const query = String(params.query ?? "").trim();
    if (!query) {
      return { success: false, error: "query 不能为空" };
    }

    const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 25);
    const hits = await searchExternalLiterature(query, { limit });

    const items = hits.map((h) => ({
      title: h.title,
      authors: h.authors?.slice(0, 5),
      year: h.year,
      journal: h.journal,
      doi: h.doi,
      isOpenAccess: h.isOpenAccess,
    }));

    return {
      success: true,
      data: { count: items.length, items },
      summary: `外部检索「${query}」返回 ${items.length} 篇文献`,
    };
  },
};
