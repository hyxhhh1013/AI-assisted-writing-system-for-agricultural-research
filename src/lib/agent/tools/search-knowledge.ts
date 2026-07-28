import { localRAG, formatRagCitation, type RagChunk } from "@/lib/rag";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

function mergeChunksById(primary: RagChunk[], extra: RagChunk[], cap: number): RagChunk[] {
  const seen = new Set<string>();
  const out: RagChunk[] = [];
  for (const c of [...primary, ...extra]) {
    const id =
      c.metadata.id
      || `${c.metadata.source}:${c.metadata.chunkIndex ?? 0}:${c.metadata.pageStart ?? 0}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(c);
    if (out.length >= cap) break;
  }
  return out;
}

export const searchKnowledgeTool: ToolDefinition = {
  name: "search_knowledge",
  description:
    "在本地知识库检索文献片段（BM25+向量+同义词扩展+多 query RRF）。可选 category 收窄分类；命中少时会自动扩全库",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "检索关键词或问句（中英文均可）" },
      limit: { type: "number", description: "返回条数，默认 12，最大 20" },
      category: { type: "string", description: "可选：限定文献分类（命中不足时自动扩全库）" },
    },
    required: ["query"],
  },
  safety: "read",
  async execute(params, _ctx: AgentContext) {
    const query = String(params.query ?? "").trim();
    if (!query) {
      return { success: false, error: "query 不能为空" };
    }

    const limit = Math.min(Math.max(Number(params.limit) || 12, 1), 20);
    const category = params.category ? String(params.category).trim() : undefined;

    let chunks = await localRAG.search(query, {
      limit,
      ...(category ? { category } : {}),
    });

    let expandedScope = false;
    if (category && chunks.length < Math.min(4, limit)) {
      const full = await localRAG.search(query, { limit: limit * 2 });
      const merged = mergeChunksById(chunks, full, limit);
      if (merged.length > chunks.length) {
        chunks = merged;
        expandedScope = true;
      }
    }

    const hits = chunks.map((c, i) => ({
      index: i + 1,
      source: c.metadata.source,
      category: c.metadata.category,
      excerpt: c.content.slice(0, 400),
      citation: formatRagCitation(c),
    }));

    const scopeNote = expandedScope ? "（分类命中不足，已扩全库）" : "";
    return {
      success: true,
      data: { count: hits.length, hits, expandedScope },
      summary: `检索「${query}」命中 ${hits.length} 条片段${scopeNote}`,
    };
  },
};
