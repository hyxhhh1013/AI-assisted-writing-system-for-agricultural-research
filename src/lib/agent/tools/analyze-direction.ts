import { buildPaperBrief } from "@/lib/direction-writing-bridge";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

export const analyzeDirectionTool: ToolDefinition = {
  name: "analyze_direction",
  description: "获取研究方向的战略简报：预推荐文献清单、研究缺口、目标期刊等（Direction→Writing 桥接）",
  parameters: {
    type: "object",
    properties: {
      directionSlug: { type: "string", description: "方向 slug" },
      candidateId: { type: "string", description: "可选：路线图中的论文候选 ID" },
    },
    required: ["directionSlug"],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    const directionSlug = String(
      params.directionSlug ?? ctx.directionSlug ?? "",
    ).trim();
    if (!directionSlug) {
      return { success: false, error: "directionSlug 不能为空" };
    }

    const candidateId = params.candidateId
      ? String(params.candidateId)
      : undefined;

    const brief = await buildPaperBrief({
      directionSlug,
      candidateId,
      userId: ctx.userId,
    });

    return {
      success: true,
      data: {
        paperType: brief.paperType,
        suggestedJournal: brief.suggestedJournal,
        motivationFromGap: brief.motivationFromGap,
        themeSuggestions: brief.themeSuggestions,
        pendingExperiments: brief.pendingExperiments,
        referenceCount: brief.requiredReferences.length,
        topReferences: brief.requiredReferences.slice(0, 10).map((r) => ({
          title: r.title,
          year: r.year,
          role: r.role,
          doi: r.doi,
        })),
      },
      summary: `方向 ${directionSlug}：${brief.requiredReferences.length} 篇推荐文献，类型 ${brief.paperType}`,
    };
  },
};
