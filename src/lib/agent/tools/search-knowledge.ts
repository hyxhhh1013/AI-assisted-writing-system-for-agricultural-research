import { localRAG, formatRagCitation, type RagChunk } from "@/lib/rag";
import { resolveRagCategoryName } from "@/lib/knowledge-category-hints";
import {
  isOffTopicLabCategory,
  resolveProjectSearchCategories,
} from "@/lib/agent/lab-scope";
import { storeLastKnowledgeSearch } from "@/lib/agent/last-search";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import {
  basenameKey,
  fullReadBudgetError,
  recordSourceKeyRead,
  resolveRefIndexBySourceKey,
} from "@/lib/agent/reading-pack";

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
    "在本地知识库检索文献片段（BM25+向量+同义词扩展+多 query RRF）。**备文献时必须先用本工具**，命中后用 import_reference(knowledgeHitIndices) 把 PDF 挂进项目（有全文）。"
    + "本地不足再 search_external。可选 category 收窄分类（须跟当前论文方向）。可选 sourceKey 只看一篇（精读，不算全库检索）。分类命中少时只在本方向扩检索，不扩到实验室其它方向",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "检索关键词或问句（中英文均可）" },
      limit: { type: "number", description: "返回条数，默认 12，最大 20" },
      category: {
        type: "string",
        description: "可选：限定文献分类（跟题目方向；命中不足时不扩到其它实验室方向）",
      },
      sourceKey: { type: "string", description: "可选：只检索该知识库文件名（精读单篇）" },
    },
    required: ["query"],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    const query = String(params.query ?? "").trim();
    if (!query) {
      return { success: false, error: "query 不能为空" };
    }

    const limit = Math.min(Math.max(Number(params.limit) || 12, 1), 20);
    const category = resolveRagCategoryName(
      params.category ? String(params.category).trim() : undefined,
    );
    const projectCats = resolveProjectSearchCategories({
      title: ctx.projectSnapshot?.title,
      researchDirection: ctx.projectSnapshot?.researchDirection,
      directionSlug: ctx.directionSlug,
    });
    const allowedCats = category
      ? [...new Set([category, ...projectCats])]
      : projectCats;
    const sourceKey = params.sourceKey ? String(params.sourceKey).trim() : "";
    if (sourceKey) {
      const n = resolveRefIndexBySourceKey(
        sourceKey,
        ctx.projectSnapshot?.referenceSourceNames,
      );
      const budget = fullReadBudgetError(ctx, n);
      if (budget) {
        return { success: false, error: budget };
      }
    }
    const scopeLabel = category
      ? category
      : projectCats.length > 0
        ? projectCats.join("、")
        : "";
    ctx.emitLiveEvent?.({
      type: "agent/progress",
      label: sourceKey
        ? `正在检索「${sourceKey}」…`
        : scopeLabel
          ? `正在检索知识库「${scopeLabel}」…`
          : "正在检索本地知识库…",
      stage: "searching",
      detail: query.slice(0, 80),
    });

    let chunks = await localRAG.search(query, {
      limit: sourceKey ? Math.max(limit, 20) : limit,
      ...(category ? { category } : {}),
      ...(!category && !sourceKey && projectCats.length > 0
        ? { categories: projectCats }
        : {}),
    });

    let expandedScope = false;
    if (sourceKey) {
      const key = basenameKey(sourceKey);
      chunks = chunks.filter((c) => basenameKey(c.metadata.source) === key);
    } else if (chunks.length < Math.min(4, limit) && allowedCats.length > 0) {
      const full = await localRAG.search(query, { limit: limit * 2 });
      const inScope = full.filter(
        (c) => !isOffTopicLabCategory(c.metadata.category, allowedCats),
      );
      const merged = mergeChunksById(chunks, inScope, limit);
      if (merged.length > chunks.length) {
        chunks = merged;
        expandedScope = true;
      }
    } else if (!sourceKey) {
      chunks = chunks.filter(
        (c) => !isOffTopicLabCategory(c.metadata.category, allowedCats),
      );
    }

    const hits = chunks.map((c, i) => ({
      index: i + 1,
      source: c.metadata.source,
      category: c.metadata.category,
      excerpt: c.content.slice(0, 400),
      citation: formatRagCitation(c),
    }));

    if (sourceKey && hits.length > 0) {
      recordSourceKeyRead(ctx, sourceKey, "full");
    }

    const files: Array<{
      index: number;
      source: string;
      category?: string;
      citation?: string;
      excerpt?: string;
    }> = [];
    const seen = new Set<string>();
    for (const h of hits) {
      const key = basenameKey(h.source);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      files.push({
        index: files.length + 1,
        source: h.source,
        category: h.category,
        citation: h.citation,
        excerpt: h.excerpt,
      });
    }
    if (!sourceKey) {
      storeLastKnowledgeSearch(
        ctx.userId,
        files.map((f) => ({
          source: f.source,
          category: f.category,
          citation: f.citation,
          excerpt: f.excerpt,
        })),
      );
    }

    const scopeNote = expandedScope ? "（分类命中不足，已在本方向扩检索）" : "";
    const topN = Math.min(15, files.length);
    const suggested = files.slice(0, topN).map((f) => f.index);
    return {
      success: true,
      data: {
        count: hits.length,
        hits,
        files,
        fileCount: files.length,
        suggestedKnowledgeHitIndices: suggested,
        expandedScope,
      },
      summary:
        `检索「${query}」命中 ${hits.length} 条片段、${files.length} 篇本地 PDF${scopeNote}`
        + (files.length > 0
          ? `。优先 import_reference(knowledgeHitIndices=[${suggested.join(",")}], why) 导入全文，不要先 search_external。`
          : "。本地无命中时再 search_external（外部多为摘要）。"),
    };
  },
};
