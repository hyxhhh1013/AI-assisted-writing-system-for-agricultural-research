import { generateRewriteSuggestions } from "@/services/rewrite-service";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

/**
 * 降重改写：为一段可能重复/抄袭的文本生成多种改写建议（同义/改写/精简/扩充）。
 * 返回改写方案及改写后相似度，供 Agent 汇报或后续 refine_content 应用。
 */
export const rewritePlagiarismTool: ToolDefinition = {
  name: "rewrite_plagiarism",
  description:
    "为一段可能重复/抄袭的文本生成降重改写建议（4 种策略：同义替换/改写/精简/扩充）。"
    + "传 originalText 与可选 contextText；返回多条改写方案及改写后相似度，"
    + "可让用户选择后用 refine_content 应用。",
  parameters: {
    type: "object",
    properties: {
      originalText: {
        type: "string",
        description: "待降重的原文片段",
      },
      contextText: {
        type: "string",
        description: "可选：支撑上下文/检索信息，帮助改写更贴合",
      },
      checkId: {
        type: "string",
        description: "可选：关联的查重记录 id（有则记录建议）",
      },
      matchId: {
        type: "string",
        description: "可选：关联的匹配片段 id",
      },
    },
    required: ["originalText"],
  },
  safety: "read",
  async execute(params, _ctx: AgentContext) {
    const originalText = String(params.originalText ?? "").trim();
    if (!originalText) {
      return { success: false, error: "originalText 不能为空" };
    }
    if (originalText.length > 20000) {
      return { success: false, error: "originalText 过长（>20000 字符），请分段处理" };
    }
    try {
      const suggestions = await generateRewriteSuggestions({
        // checkId 为必填；无关联查重记录时传空串（服务端跳过持久化，仅返回建议）
        checkId: String(params.checkId ?? ""),
        matchId: params.matchId ? String(params.matchId) : undefined,
        originalText,
        contextText: params.contextText ? String(params.contextText) : undefined,
      });
      return {
        success: true,
        data: { count: suggestions.length, suggestions },
        summary: `已生成 ${suggestions.length} 条降重改写建议（相似度 ${suggestions[0]?.similarityAfter != null ? `${Math.round(suggestions[0].similarityAfter * 100)}%` : "—"}起）`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  },
};
