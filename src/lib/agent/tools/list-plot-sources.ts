import {
  loadAgentPlotSources,
  noPlotDataGuidance,
} from "@/lib/agent/plot-sources";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

/**
 * 列出项目内可配图数据与推荐图目录，供 generate_chart(chartIndex=…) 引用。
 */
export const listPlotSourcesTool: ToolDefinition = {
  name: "list_plot_sources",
  description:
    "查看项目里有哪些试验数据/推荐图表可生成。配图前先调用；若为空则按返回指引请用户上传数据或粘贴 CSV，不要空转猜数",
  parameters: {
    type: "object",
    properties: {
      includeClaimSample: {
        type: "string",
        description: "是否附带证据声明样例（默认 true）",
      },
    },
    required: [],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "list_plot_sources 需要绑定 projectId" };
    }

    const bundle = await loadAgentPlotSources(ctx.userId, ctx.projectId);
    if (!bundle) {
      return { success: false, error: "项目不存在或无权访问" };
    }

    const includeClaims =
      params.includeClaimSample === undefined
      || params.includeClaimSample === true
      || params.includeClaimSample === "true"
      || params.includeClaimSample === "1";

    if (bundle.candidates.length === 0) {
      const guidance = noPlotDataGuidance(
        bundle.claims.length,
        bundle.existingChartCount,
      );
      return {
        success: true,
        data: {
          sourceCount: bundle.sources.length,
          candidateCount: 0,
          claimCount: bundle.claims.length,
          existingChartCount: bundle.existingChartCount,
          candidates: [],
          guidance,
          sources: bundle.sources.map((s) => ({
            fileName: s.fileName,
            rowCount: s.rowCount,
            columns: s.columns.map((c) => c.name),
          })),
        },
        summary: guidance,
      };
    }

    const claimSample = includeClaims
      ? bundle.claims.slice(0, 8).map((c) => ({
          id: c.id,
          text: c.text.slice(0, 160),
          type: c.type,
        }))
      : undefined;

    return {
      success: true,
      data: {
        sourceCount: bundle.sources.length,
        candidateCount: bundle.candidates.length,
        claimCount: bundle.claims.length,
        existingChartCount: bundle.existingChartCount,
        candidates: bundle.candidates,
        claimSample,
        howTo:
          "调用 generate_chart(chartIndex=N) 即可用推荐配置出图；也可自备 csvData+chartType。",
      },
      summary: `发现 ${bundle.candidates.length} 个可配图候选（数据源 ${bundle.sources.length} 个，已有图 ${bundle.existingChartCount} 张）。用 generate_chart(chartIndex=0…) 生成。`,
    };
  },
};
