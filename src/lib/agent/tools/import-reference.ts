import type { ExternalLiteratureHit } from "@/contracts/literature";
import { importExternalReferenceToProject } from "@/lib/agent/import-reference";
import { searchExternalLiterature } from "@/lib/literature-search";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import { externalLiteratureHitSchema } from "@/lib/validations";
import { formatExternalLiteratureHit } from "@/lib/external-literature-format";

function parseUserConfirmed(raw: unknown): boolean {
  return raw === true || raw === "true" || raw === 1 || raw === "1";
}

function parseHitFromParams(params: Record<string, unknown>): ExternalLiteratureHit | null {
  if (params.hitJson) {
    try {
      const parsed = JSON.parse(String(params.hitJson)) as unknown;
      const result = externalLiteratureHitSchema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }
  return null;
}

export const importReferenceTool: ToolDefinition = {
  name: "import_reference",
  description:
    "将外部检索命中的文献导入项目参考文献。首次调用请 userConfirmed=false 预览；用户同意后再 userConfirmed=true 执行",
  parameters: {
    type: "object",
    properties: {
      hitJson: {
        type: "string",
        description: "ExternalLiteratureHit 的 JSON（来自 search_external_literature）",
      },
      doi: {
        type: "string",
        description: "可选：按 DOI 检索并导入首条命中（与 hitJson 二选一）",
      },
      userConfirmed: {
        type: "string",
        description: "用户已确认导入时为 true，否则仅返回预览",
      },
      index: {
        type: "number",
        description: "可选：插入到参考文献列表的位置（0 起）",
      },
    },
    required: [],
  },
  safety: "write",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "import_reference 需要关联 projectId" };
    }

    let hit = parseHitFromParams(params);
    const doi = String(params.doi ?? "").trim();

    if (!hit && doi) {
      const hits = await searchExternalLiterature(doi, { limit: 3 });
      hit = hits[0] ?? null;
      if (!hit) {
        return { success: false, error: `未找到 DOI 对应文献: ${doi}` };
      }
    }

    if (!hit) {
      return {
        success: false,
        error: "请提供 hitJson（search_external_literature 结果）或 doi",
      };
    }

    const citation = formatExternalLiteratureHit(hit);
    const userConfirmed = parseUserConfirmed(params.userConfirmed);

    if (!userConfirmed) {
      return {
        success: true,
        data: {
          requiresConfirmation: true,
          hit: {
            title: hit.title,
            authors: hit.authors.slice(0, 5),
            year: hit.year,
            doi: hit.doi,
            journal: hit.journal,
          },
          citationPreview: citation,
        },
        summary: `待确认：导入「${hit.title.slice(0, 60)}」到参考文献`,
      };
    }

    const index =
      params.index !== undefined && Number.isFinite(Number(params.index))
        ? Math.max(0, Math.floor(Number(params.index)))
        : undefined;

    try {
      const result = await importExternalReferenceToProject(
        ctx.userId,
        ctx.projectId,
        hit,
        index,
      );
      return {
        success: true,
        data: {
          citation: result.citation,
          referenceCount: result.referenceCount,
        },
        summary: `已导入参考文献（共 ${result.referenceCount} 条）`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  },
};
