import { removeAgentChart } from "@/lib/agent/chart-persist";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

/**
 * 删除项目图表资产，并默认从章节正文去掉对应 Markdown 图片。
 * 「改图」场景优先在 draft_mechanism_figure / generate_chart 上传 replaceImageUrl；
 * 本工具用于明确删图、清掉叠在一起的旧图。
 */
export const removeFigureTool: ToolDefinition = {
  name: "remove_figure",
  description:
    "删除项目里已生成的图表/机理图：从图表库移除资产，并默认从章节正文去掉对应 Markdown 图片。"
    + "改图重画时优先在 draft_mechanism_figure / generate_chart 传 replaceImageUrl（或 replaceChartId）就地替换；"
    + "若旧图已叠了多张，用本工具按 imageUrl 或 chartId 清掉多余的。"
    + "imageUrl 形如 /api/charts/<uuid>.png；chartId 来自图表资产 id（可用 read_figure / inspect 查看）。"
    + "属破坏性操作，执行前会请用户确认。",
  safety: "destructive",
  requiresConfirmation: true,
  parameters: {
    type: "object",
    properties: {
      imageUrl: {
        type: "string",
        description: "要删除的图 URL（/api/charts/...png）",
      },
      chartId: {
        type: "string",
        description: "要删除的图表资产 id（与 imageUrl 二选一，优先 chartId）",
      },
      keepInBody: {
        type: "string",
        description: "若为 true，只删图表库资产、保留正文 Markdown（默认 false=正文一并去掉）",
      },
      reason: {
        type: "string",
        description: "删除原因（如：重画替换、重复插入、质量不合格）",
      },
    },
    required: [],
  },
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "remove_figure 需要关联 projectId" };
    }
    const chartId = String(params.chartId ?? "").trim();
    const imageUrl = String(params.imageUrl ?? "").trim();
    if (!chartId && !imageUrl) {
      return { success: false, error: "请提供 chartId 或 imageUrl" };
    }
    const keepInBody = String(params.keepInBody ?? "").toLowerCase() === "true";

    try {
      const { deleted, strippedFrom } = await removeAgentChart(
        ctx.userId,
        ctx.projectId,
        {
          chartId: chartId || undefined,
          imageUrl: imageUrl || undefined,
          stripFromBody: !keepInBody,
        },
      );
      const bits = [
        `已删除图表「${deleted.caption || deleted.figureId}」`,
        deleted.imageUrl,
      ];
      if (strippedFrom.length > 0) {
        bits.push(`已从章节正文移除：${strippedFrom.join(", ")}`);
      } else if (!keepInBody) {
        bits.push("正文中未找到对应 Markdown（可能只在图表库）");
      }
      if (params.reason) bits.push(`原因：${String(params.reason)}`);
      return {
        success: true,
        summary: bits.join("；"),
        data: {
          deletedId: deleted.id,
          imageUrl: deleted.imageUrl,
          sectionKey: deleted.sectionKey ?? "",
          strippedFrom,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
