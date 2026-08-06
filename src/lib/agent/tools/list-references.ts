import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import { isSoftGroundable } from "@/lib/reference-evidence";
import { findReferenceRowsLite } from "@/lib/reference-rows";

/**
 * 列出当前项目参考文献（Phase 1 文献策略 / 引用检查前自取上下文）。
 */
export const listReferencesTool: ToolDefinition = {
  name: "list_references",
  description:
    "列出项目已收录的参考文献（编号、题录、是否有摘要）。写引用前先调用；"
    + "有摘要的条目可用 read_reference 精读，再 write_section",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "可选：在文献文本中过滤（不区分大小写）",
      },
      limit: {
        type: "number",
        description: "最多返回条数，默认 40，上限 80",
      },
      onlyWithAbstract: {
        type: "boolean",
        description: "若 true，只返回有摘要、可 soft-grounded 的条目",
      },
    },
    required: [],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "list_references 需要绑定 projectId" };
    }

    const refs = await findReferenceRowsLite(ctx.projectId, ctx.userId);

    const query = String(params.query ?? "").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(params.limit) || 40, 1), 80);
    const onlyWithAbstract =
      params.onlyWithAbstract === true
      || params.onlyWithAbstract === "true"
      || params.onlyWithAbstract === 1
      || params.onlyWithAbstract === "1";

    let rows = refs.map((r) => {
      const text = (r.content ?? "").replace(/\s+/g, " ").trim();
      const hasAbstract = isSoftGroundable(r.abstract);
      return {
        index: r.order + 1,
        text,
        title: r.title,
        doi: r.doi,
        hasAbstract,
      };
    });

    if (onlyWithAbstract) {
      rows = rows.filter((r) => r.hasAbstract);
    }

    if (query) {
      rows = rows.filter(
        (r) =>
          r.text.toLowerCase().includes(query)
          || (r.title ?? "").toLowerCase().includes(query)
          || (r.doi ?? "").toLowerCase().includes(query),
      );
    }

    const withAbstractCount = refs.filter((r) => isSoftGroundable(r.abstract)).length;
    const total = rows.length;
    const sliced = rows.slice(0, limit).map((r) => ({
      index: r.index,
      text: r.text.length > 280 ? `${r.text.slice(0, 280)}…` : r.text,
      title: r.title,
      doi: r.doi,
      hasAbstract: r.hasAbstract,
    }));

    return {
      success: true,
      data: {
        totalInProject: refs.length,
        withAbstract: withAbstractCount,
        matched: total,
        returned: sliced.length,
        query: query || null,
        references: sliced,
      },
      summary: query
        ? `项目文献 ${refs.length} 条（有摘要 ${withAbstractCount}），匹配「${query}」${total} 条，返回 ${sliced.length} 条`
        : `项目文献共 ${refs.length} 条（有摘要 ${withAbstractCount}），返回前 ${sliced.length} 条`,
    };
  },
};
