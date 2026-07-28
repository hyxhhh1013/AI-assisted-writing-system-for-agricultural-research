import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import { isSoftGroundable } from "@/lib/reference-evidence";
import { findReferenceRowsLite } from "@/lib/reference-rows";

const MAX_ABSTRACT_RETURN = 6000;

/**
 * 读取项目参考文献的题录 + 摘要（外部导入后 Agent「读懂」入口）。
 * 知识库全文仍用 read_full_text / search_knowledge。
 */
export const readReferenceTool: ToolDefinition = {
  name: "read_reference",
  description:
    "按编号或 DOI 读取项目参考文献的题录与摘要（外部导入文献的主要阅读入口）。"
    + "写综述/核对引用前应对相关 [n] 调用；知识库 PDF 全文请用 read_full_text",
  parameters: {
    type: "object",
    properties: {
      index: {
        type: "number",
        description: "参考文献编号（1-based，与正文 [n] 一致）",
      },
      doi: {
        type: "string",
        description: "可选：按 DOI 查找（与 index 二选一或同时作校验）",
      },
    },
    required: [],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "read_reference 需要绑定 projectId" };
    }

    const indexRaw = params.index != null ? Number(params.index) : NaN;
    const doi = String(params.doi ?? "").trim().toLowerCase();

    if (!Number.isFinite(indexRaw) && !doi) {
      return { success: false, error: "请提供 index（编号）或 doi" };
    }

    const refs = await findReferenceRowsLite(ctx.projectId, ctx.userId);

    let ref =
      Number.isFinite(indexRaw) && indexRaw >= 1
        ? refs[Math.floor(indexRaw) - 1]
        : undefined;

    if (!ref && doi) {
      ref = refs.find((r) => r.doi?.trim().toLowerCase() === doi);
    }

    if (!ref) {
      return {
        success: false,
        error: Number.isFinite(indexRaw)
          ? `未找到参考文献 [${Math.floor(indexRaw)}]（项目共 ${refs.length} 篇）`
          : `未找到 DOI=${doi} 的参考文献`,
      };
    }

    const index = ref.order + 1;
    const abstract = ref.abstract?.trim() || "";
    const truncated = abstract.length > MAX_ABSTRACT_RETURN;
    const abstractOut = truncated
      ? `${abstract.slice(0, MAX_ABSTRACT_RETURN)}…`
      : abstract;

    const softGroundable = isSoftGroundable(abstract);

    return {
      success: true,
      data: {
        index,
        content: ref.content,
        title: ref.title,
        doi: ref.doi,
        abstract: abstractOut || null,
        abstractChars: abstract.length,
        truncated,
        softGroundable,
        openAccessUrl: ref.openAccessUrl,
        externalSource: ref.externalSource,
        hint: softGroundable
          ? "有摘要：写作时可概括引用并标 [n]；勿编造摘要未出现的精确数据。"
          : "无摘要：仅书目。请优先 search_knowledge / 知识库全文，或换有摘要的外部文献。",
      },
      summary: softGroundable
        ? `已读 [${index}] 摘要（${abstract.length} 字）`
        : `已读 [${index}] 题录（无摘要）`,
    };
  },
};
