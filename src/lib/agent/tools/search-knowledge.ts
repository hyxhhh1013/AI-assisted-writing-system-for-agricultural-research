import { localRAG, formatRagCitation } from "@/lib/rag";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

export const searchKnowledgeTool: ToolDefinition = {
  name: "search_knowledge",
  description: "在本地知识库中检索与查询相关的文献片段（BM25 + 向量混合检索）",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "检索关键词或问句" },
      limit: { type: "number", description: "返回条数，默认 8，最大 20" },
      category: { type: "string", description: "可选：限定文献分类" },
    },
    required: ["query"],
  },
  safety: "read",
  async execute(params, _ctx: AgentContext) {
    const query = String(params.query ?? "").trim();
    if (!query) {
      return { success: false, error: "query 不能为空" };
    }

    const limit = Math.min(Math.max(Number(params.limit) || 8, 1), 20);
    const category = params.category ? String(params.category) : undefined;

    const chunks = await localRAG.search(query, {
      limit,
      ...(category ? { category } : {}),
    });

    const hits = chunks.map((c, i) => ({
      index: i + 1,
      source: c.metadata.source,
      category: c.metadata.category,
      excerpt: c.content.slice(0, 400),
      citation: formatRagCitation(c),
    }));

    return {
      success: true,
      data: { count: hits.length, hits },
      summary: `检索「${query}」命中 ${hits.length} 条片段`,
    };
  },
};
