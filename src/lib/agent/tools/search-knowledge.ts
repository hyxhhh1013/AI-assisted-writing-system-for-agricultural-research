import { localRAG, formatRagCitation, type RagChunk } from "@/lib/rag";
import { resolveRagCategoryName } from "@/lib/knowledge-category-hints";
import {
  isOffTopicLabCategory,
  resolveProjectSearchCategories,
} from "@/lib/agent/lab-scope";
import { mergeLastKnowledgeSearch } from "@/lib/agent/last-search";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import {
  basenameKey,
  fullReadBudgetError,
  recordSourceKeyRead,
  resolveRefIndexBySourceKey,
} from "@/lib/agent/reading-pack";
import {
  composeKnowledgeSearchQuery,
  KNOWLEDGE_PAPER_CHUNK_LIMIT,
  KNOWLEDGE_PAPER_MAX_PER_SOURCE,
  rankKnowledgePapers,
  suggestedKnowledgeIndices,
} from "@/lib/agent/knowledge-search-rank";

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
    "在本地知识库按篇检索全文 PDF（BM25+向量+题目锚定+相关度排序）。**备文献先用本工具一次**，"
    + "按 files[] 相关度用 import_reference(knowledgeHitIndices) 导入。禁止换同义词连搜。"
    + "本地不足再 search_external。可选 category 收窄分类。可选 sourceKey 只看一篇（精读）。",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "检索关键词或问句（中英文均可；会自动叠题目方向）" },
      limit: { type: "number", description: "返回篇数上限，默认 20，最大 25" },
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
    const rawQuery = String(params.query ?? "").trim();
    if (!rawQuery) {
      return { success: false, error: "query 不能为空" };
    }

    const paperLimit = Math.min(Math.max(Number(params.limit) || 20, 1), 25);
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
    const query = sourceKey
      ? rawQuery
      : composeKnowledgeSearchQuery(
          rawQuery,
          ctx.projectSnapshot?.title,
          ctx.projectSnapshot?.researchDirection,
        );
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

    const chunkLimit = sourceKey
      ? Math.max(paperLimit, 20)
      : KNOWLEDGE_PAPER_CHUNK_LIMIT;
    let chunks = await localRAG.search(query, {
      limit: chunkLimit,
      maxPerSource: sourceKey ? 8 : KNOWLEDGE_PAPER_MAX_PER_SOURCE,
      multiQuery: sourceKey ? "auto" : true,
      ...(category ? { category } : {}),
      ...(!category && !sourceKey && projectCats.length > 0
        ? { categories: projectCats }
        : {}),
    });

    let expandedScope = false;
    if (sourceKey) {
      const key = basenameKey(sourceKey);
      chunks = chunks.filter((c) => basenameKey(c.metadata.source) === key);
    } else if (chunks.length < Math.min(8, chunkLimit) && allowedCats.length > 0) {
      const full = await localRAG.search(query, {
        limit: chunkLimit,
        maxPerSource: KNOWLEDGE_PAPER_MAX_PER_SOURCE,
        multiQuery: true,
      });
      const inScope = full.filter(
        (c) => !isOffTopicLabCategory(c.metadata.category, allowedCats),
      );
      const merged = mergeChunksById(chunks, inScope, chunkLimit);
      if (merged.length > chunks.length) {
        chunks = merged;
        expandedScope = true;
      }
    } else if (!sourceKey) {
      chunks = chunks.filter(
        (c) => !isOffTopicLabCategory(c.metadata.category, allowedCats),
      );
    }

    if (sourceKey) {
      const hits = chunks.slice(0, paperLimit).map((c, i) => ({
        index: i + 1,
        source: c.metadata.source,
        category: c.metadata.category,
        excerpt: c.content.slice(0, 400),
        citation: formatRagCitation(c),
      }));
      if (hits.length > 0) {
        recordSourceKeyRead(ctx, sourceKey, "full");
      }
      return {
        success: true,
        data: { count: hits.length, hits, files: [], fileCount: 0 },
        summary: `精读「${sourceKey}」命中 ${hits.length} 条片段`,
      };
    }

    const ranked = rankKnowledgePapers(chunks, query).slice(0, paperLimit);
    const stored = mergeLastKnowledgeSearch(
      ctx.userId,
      ranked.map((p) => ({
        source: p.source,
        category: p.category,
        citation: p.citation,
        excerpt: p.excerpt,
        relevanceScore: p.relevanceScore,
        why: p.why,
      })),
    );
    const files = stored.map((f, i) => ({
      index: i + 1,
      source: f.source,
      category: f.category,
      citation: f.citation,
      excerpt: f.excerpt,
      relevanceScore: f.relevanceScore,
      why: f.why,
    }));
    const suggested = suggestedKnowledgeIndices(files);
    const hits = ranked.slice(0, 12).map((p, i) => ({
      index: i + 1,
      source: p.source,
      category: p.category,
      excerpt: p.excerpt,
      citation: p.citation,
      relevanceScore: p.relevanceScore,
    }));

    const scopeNote = expandedScope ? "（分类命中不足，已在本方向扩检索）" : "";
    const queryNote = query !== rawQuery ? `（已叠题目「${query.slice(0, 40)}…」）` : "";
    return {
      success: true,
      data: {
        count: hits.length,
        hits,
        files,
        fileCount: files.length,
        suggestedKnowledgeHitIndices: suggested,
        expandedScope,
        searchQuery: query,
      },
      summary:
        `检索「${rawQuery}」${queryNote}命中 ${files.length} 篇本地 PDF（按相关度排序）${scopeNote}`
        + (files.length > 0
          ? `。立刻 import_reference(knowledgeHitIndices=[${suggested.join(",")}], why) 导入全文，不要再换词 search_knowledge。`
          : "。本地无命中时再 search_external（外部多为摘要）。"),
    };
  },
};
