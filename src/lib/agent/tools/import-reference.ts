import type { ExternalLiteratureHit } from "@/contracts/literature";
import {
  importExternalReferenceToProject,
  importExternalReferencesToProject,
} from "@/lib/agent/import-reference";
import {
  isRelevanceAcceptable,
  parseWhyParam,
  scoreLiteratureRelevance,
} from "@/lib/agent/literature-relevance";
import { searchExternalLiterature } from "@/lib/literature-search";
import { resolveAgentHitIndices } from "@/lib/agent/last-search";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import { externalLiteratureHitSchema } from "@/lib/validations";
import { formatExternalLiteratureHit } from "@/lib/external-literature-format";

/** 单次批量导入上限（综述需多轮凑满 ~30 篇） */
const MAX_BATCH = 15;

function parseUserConfirmed(raw: unknown): boolean {
  return raw === true || raw === "true" || raw === 1 || raw === "1";
}

/**
 * Agent 手写 hitsJson 常缺 id / 写错 source。
 * - id：优先 doi:xxx
 * - source：映射到 openalex | semantic-scholar | crossref | pubmed
 */
const SOURCE_ALIASES: Record<string, "openalex" | "semantic-scholar" | "crossref" | "pubmed"> = {
  openalex: "openalex",
  "open-alex": "openalex",
  open_alex: "openalex",
  oa: "openalex",
  "semantic-scholar": "semantic-scholar",
  semanticscholar: "semantic-scholar",
  "semantic scholar": "semantic-scholar",
  s2: "semantic-scholar",
  crossref: "crossref",
  "cross-ref": "crossref",
  cross_ref: "crossref",
  pubmed: "pubmed",
  "pub-med": "pubmed",
  medline: "pubmed",
};

function coerceLiteratureSource(raw: unknown): "openalex" | "semantic-scholar" | "crossref" | "pubmed" {
  if (typeof raw !== "string" || !raw.trim()) return "openalex";
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return SOURCE_ALIASES[key] ?? SOURCE_ALIASES[key.replace(/_/g, "-")] ?? "openalex";
}

export function coerceExternalHitCandidate(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = { ...(raw as Record<string, unknown>) };

  o.source = coerceLiteratureSource(o.source);
  if (Array.isArray(o.sources)) {
    o.sources = o.sources.map((s) => coerceLiteratureSource(s));
  }

  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) {
    const doi = typeof o.doi === "string" ? o.doi.trim() : "";
    if (doi) {
      o.id = doi.toLowerCase().startsWith("doi:") ? doi : `doi:${doi}`;
    } else {
      const title = typeof o.title === "string" ? o.title.trim() : "";
      const source = String(o.source);
      if (title) {
        const key = title
          .toLowerCase()
          .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 80);
        o.id = `${source}:${key || "untitled"}`;
      }
    }
  }
  return o;
}

function parseHitFromParams(params: Record<string, unknown>): ExternalLiteratureHit | null {
  if (params.hitJson) {
    try {
      const parsed = JSON.parse(String(params.hitJson)) as unknown;
      const result = externalLiteratureHitSchema.safeParse(coerceExternalHitCandidate(parsed));
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }
  return null;
}

function parseHitsBatch(params: Record<string, unknown>): ExternalLiteratureHit[] | { error: string } {
  let raw = params.hitsJson ?? params.hitJsons;
  if (raw == null || raw === "") return [];
  // 偶发双重 JSON 编码：'"[{...}]"'
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (
      (trimmed.startsWith("\"") && trimmed.endsWith("\""))
      || (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      try {
        raw = JSON.parse(trimmed);
      } catch {
        /* keep original */
      }
    }
  }
  let parsed: unknown;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { error: "hitsJson 必须是 JSON 数组" };
  }
  // 若仍是字符串，再解一层
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return { error: "hitsJson 必须是 JSON 数组" };
    }
  }
  if (!Array.isArray(parsed)) {
    return { error: "hitsJson 必须是数组" };
  }
  if (parsed.length === 0) {
    return { error: "hitsJson 为空" };
  }
  if (parsed.length > MAX_BATCH) {
    return { error: `一次最多导入 ${MAX_BATCH} 篇` };
  }
  const hits: ExternalLiteratureHit[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    // 允许直接 hit 对象，或 { hitJson: "..." }
    let candidate: unknown = item;
    if (item && typeof item === "object" && "hitJson" in (item as object)) {
      try {
        candidate = JSON.parse(String((item as { hitJson: unknown }).hitJson));
      } catch {
        return { error: `hitsJson[${i}].hitJson 不是合法 JSON` };
      }
    }
    const result = externalLiteratureHitSchema.safeParse(
      coerceExternalHitCandidate(candidate),
    );
    if (!result.success) {
      const detail = result.error.issues
        .slice(0, 3)
        .map((iss) => `${iss.path.join(".") || "(root)"}: ${iss.message}`)
        .join("; ");
      return { error: `hitsJson[${i}] 不是合法文献对象（${detail}）` };
    }
    hits.push(result.data);
  }
  return hits;
}

export const importReferenceTool: ToolDefinition = {
  name: "import_reference",
  description:
    "将文献导入项目。**优先 hitIndices**：引用最近一次 search_external 返回的命中 index（1 起，如 \"[1,3,5]\"），参数小、不会被截断，不要手写 JSON。"
    + "仅当没有可用 hitIndices 时才用 hitsJson；手写合法示例："
    + `[{"id":"doi:10.1000/abc","title":"论文标题","authors":["作者A","作者B"],"year":2023,"journal":"期刊名","doi":"10.1000/abc","source":"crossref"}]`
    + "（source 仅限 openalex|semantic-scholar|crossref|pubmed；authors 必须是字符串数组；有 doi 可省略 id）。"
    + "须传 query 与 why（≥8字）。综述目标通常 ≥30 篇，可分批导入",
  parameters: {
    type: "object",
    properties: {
      hitIndices: {
        type: "string",
        description:
          "多篇：最近一次 search_external 返回的 items[].index 数组，如 \"[1,2,3]\" 或 \"1,2,3\"（1 起）。"
          + "与 hitsJson 二选一，最推荐（参数小、不会被模型截断）",
      },
      hitJson: {
        type: "string",
        description: "单篇：ExternalLiteratureHit JSON（来自 search_external items[].hitJson）",
      },
      hitsJson: {
        type: "string",
        description:
          "多篇：JSON 数组。优先直接用 search_external 返回的 suggestedHitsJson（含合法 id/source）。"
          + "手写合法示例："
          + `[{"id":"doi:10.1000/abc","title":"标题","authors":["作者A"],"year":2023,"journal":"期刊","source":"crossref"}]`
          + "（source 仅限 openalex|semantic-scholar|crossref|pubmed；authors 必须是字符串数组；有 doi 可省略 id）",
      },
      doi: {
        type: "string",
        description: "可选：按 DOI 检索并导入首条（与 hitJson/hitsJson 二选一）",
      },
      query: {
        type: "string",
        description: "原检索词（相关度复核）",
      },
      why: {
        type: "string",
        description: "为何导入（至少 8 字；批量时可写共性理由）",
      },
      userConfirmed: {
        type: "string",
        description: "用户已在界面确认导入时为 true",
      },
      index: {
        type: "number",
        description: "可选：单篇插入位置（0 起）；批量导入忽略",
      },
    },
    required: [],
  },
  safety: "write",
  requiresConfirmation: true,
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "import_reference 需要关联 projectId" };
    }

    const query = String(params.query ?? "").trim();
    const why = parseWhyParam(params.why);
    const whyOk = why.length >= 8;
    const userConfirmed = parseUserConfirmed(params.userConfirmed);

    const batchOrErr = parseHitsBatch(params);
    if ("error" in batchOrErr) {
      return { success: false, error: batchOrErr.error };
    }

    let hits = batchOrErr;

    // hitIndices → 复用最近一次 search_external 的命中（1 起），避免 Agent 重贴大 JSON 被截断
    if (hits.length === 0) {
      const fromStore = resolveAgentHitIndices(params.hitIndices, ctx.userId);
      if ("error" in fromStore) {
        return { success: false, error: fromStore.error };
      }
      hits = fromStore.hits;
    }

    if (hits.length === 0) {
      let hit = parseHitFromParams(params);
      const doi = String(params.doi ?? "").trim();
      const doiLookup = Boolean(doi && !params.hitJson);

      if (!hit && doi) {
        const found = await searchExternalLiterature(doi, { limit: 3 });
        hit = found[0] ?? null;
        if (!hit) {
          return { success: false, error: `未找到 DOI 对应文献: ${doi}` };
        }
      }

      if (!hit) {
        return {
          success: false,
          error: "请提供 hitsJson（多篇）或 hitJson（单篇）或 doi",
        };
      }
      hits = [hit];

      // 单篇相关度门禁（批量在下面统一）
      if (hits.length === 1) {
        const one = hits[0];
        const relQuery = query || doi || one.title;
        const rel = scoreLiteratureRelevance(relQuery, one);
        if (!isRelevanceAcceptable(rel.score, { hasWhy: whyOk, doiLookup })) {
          return {
            success: false,
            error:
              `相关度偏低（score=${rel.score}：${rel.why}）。`
              + `请换更相关条目，或提供 why（≥8字）说明为何仍要导入。`,
            data: { relevanceScore: rel.score, autoWhy: rel.why },
          };
        }
        if (!userConfirmed) {
          const citation = formatExternalLiteratureHit(one);
          const reason = whyOk ? why : rel.why;
          return {
            success: true,
            data: {
              requiresConfirmation: true,
              preview: true,
              hit: {
                title: one.title,
                authors: one.authors.slice(0, 5),
                year: one.year,
                doi: one.doi,
                journal: one.journal,
              },
              citationPreview: citation,
              relevanceScore: rel.score,
              why: reason,
            },
            summary:
              `待确认：导入「${one.title.slice(0, 60)}」`
              + `（相关度 ${rel.score}；${reason.slice(0, 40)}）`,
          };
        }
        if (!whyOk && !doiLookup && rel.score < 0.35) {
          return {
            success: false,
            error: "确认导入时请提供 why（≥8字），说明该文献与课题的关系",
          };
        }
        try {
          const index =
            params.index !== undefined && Number.isFinite(Number(params.index))
              ? Math.max(0, Math.floor(Number(params.index)))
              : undefined;
          const result = await importExternalReferenceToProject(
            ctx.userId,
            ctx.projectId,
            one,
            index,
            { directionSlug: ctx.directionSlug },
          );
          const kbHint = result.knowledge
            ? result.knowledge.mode === "pdf"
              ? `；知识库「${result.knowledge.category}」已入库 OA PDF`
              : result.knowledge.mode === "abstract"
                ? `；知识库「${result.knowledge.category}」已索引摘要`
                : `；知识库「${result.knowledge.category}」已登记书目（无摘要/无 OA PDF）`
            : "";
          return {
            success: true,
            data: {
              persisted: true,
              citation: result.citation,
              referenceCount: result.referenceCount,
              relevanceScore: rel.score,
              why: whyOk ? why : rel.why,
              imported: 1,
              hasAbstract: result.hasAbstract,
              knowledge: result.knowledge,
            },
            summary:
              `已导入参考文献（共 ${result.referenceCount} 条；相关度 ${rel.score}）${kbHint}。`
              + `理由：${(whyOk ? why : rel.why).slice(0, 60)}`,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { success: false, error: message };
        }
      }
    }

    // ── 批量路径 ──
    const scored = hits.map((h) => {
      const rel = scoreLiteratureRelevance(query || h.title, h);
      return { hit: h, rel };
    });
    const accepted = scored.filter(
      (x) => isRelevanceAcceptable(x.rel.score, { hasWhy: whyOk, doiLookup: false }),
    );
    if (accepted.length === 0) {
      return {
        success: false,
        error:
          `批量 ${hits.length} 篇相关度均偏低。请提供 why（≥8字）说明共性理由，或只选高相关条目。`,
        data: {
          scores: scored.map((x) => ({
            title: x.hit.title.slice(0, 60),
            score: x.rel.score,
          })),
        },
      };
    }

    if (!userConfirmed) {
      const titles = accepted.map((x) => x.hit.title.slice(0, 40));
      return {
        success: true,
        data: {
          requiresConfirmation: true,
          preview: true,
          batch: true,
          count: accepted.length,
          titles,
          hits: accepted.map((x) => ({
            title: x.hit.title,
            year: x.hit.year,
            doi: x.hit.doi,
            relevanceScore: x.rel.score,
          })),
          why: whyOk ? why : accepted[0]?.rel.why,
        },
        summary: `待确认：批量导入 ${accepted.length} 篇文献（${titles[0]}…）`,
      };
    }

    if (!whyOk && accepted.some((x) => x.rel.score < 0.35)) {
      return {
        success: false,
        error: "批量确认导入时请提供 why（≥8字），说明这些文献与课题的关系",
      };
    }

    try {
      const result = await importExternalReferencesToProject(
        ctx.userId,
        ctx.projectId,
        accepted.map((x) => x.hit),
        { directionSlug: ctx.directionSlug },
      );
      const kbParts: string[] = [];
      if (result.knowledgeWithPdf && result.knowledgeWithPdf > 0) {
        kbParts.push(`OA PDF ${result.knowledgeWithPdf} 篇`);
      }
      if (result.knowledgeWithAbstract && result.knowledgeWithAbstract > 0) {
        kbParts.push(`摘要可检索 ${result.knowledgeWithAbstract} 篇`);
      }
      if (
        kbParts.length === 0
        && result.knowledgeCreated
        && result.knowledgeCreated > 0
      ) {
        kbParts.push(`书目登记 ${result.knowledgeCreated} 篇`);
      }
      const kbHint = kbParts.length > 0 ? `；知识库${kbParts.join("，")}` : "";
      return {
        success: true,
        data: {
          persisted: true,
          batch: true,
          imported: result.imported,
          skippedDuplicate: result.skippedDuplicate,
          referenceCount: result.referenceCount,
          withAbstract: result.withAbstract,
          knowledgeCreated: result.knowledgeCreated,
          knowledgeWithAbstract: result.knowledgeWithAbstract,
          knowledgeWithPdf: result.knowledgeWithPdf,
          why: whyOk ? why : "批量导入",
        },
        summary:
          `已批量导入 ${result.imported} 篇`
          + (result.skippedDuplicate ? `（跳过重复 ${result.skippedDuplicate}）` : "")
          + `；参考文献共 ${result.referenceCount} 条${kbHint}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  },
};
