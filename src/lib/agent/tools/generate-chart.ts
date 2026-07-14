import type { ProjectChartAsset } from "@/contracts/figure";
import { persistAgentChart } from "@/lib/agent/chart-persist";
import { parsePersistToProject } from "@/lib/agent/writing-sections";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import {
  AGENT_CHART_TYPES,
  isAgentChartType,
  runChartGeneration,
} from "@/lib/chart-runner";

const MAX_CSV_CHARS = 100_000;

export const generateChartTool: ToolDefinition = {
  name: "generate_chart",
  description:
    "根据 CSV tabular 数据生成科学图表（matplotlib/Python），可写入项目图表资产库",
  parameters: {
    type: "object",
    properties: {
      chartType: {
        type: "string",
        description: "registry 图表类型 id",
        enum: [...AGENT_CHART_TYPES],
      },
      csvData: {
        type: "string",
        description: "CSV 数据（首行为表头），例：温度,N₂,CO₂\\n500,44,44",
      },
      title: { type: "string", description: "图表标题" },
      xLabel: { type: "string", description: "X 轴标签" },
      yLabel: { type: "string", description: "Y 轴标签" },
      caption: {
        type: "string",
        description: "图注/说明（写入项目资产时使用，默认同 title）",
      },
      sectionKey: {
        type: "string",
        description: "可选：关联论文章节 key",
      },
      configJson: {
        type: "string",
        description: "可选：额外 config 字段 JSON 对象字符串",
      },
      persistToProject: {
        type: "string",
        description: "是否写入 Project.charts（默认 true）",
      },
    },
    required: ["chartType", "csvData"],
  },
  safety: "write",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "generate_chart 需要关联 projectId" };
    }

    const chartType = String(params.chartType ?? "").trim();
    if (!isAgentChartType(chartType)) {
      return { success: false, error: `无效 chartType: ${chartType}` };
    }

    const csvData = String(params.csvData ?? "").trim();
    if (!csvData) {
      return { success: false, error: "csvData 不能为空" };
    }
    if (csvData.length > MAX_CSV_CHARS) {
      return { success: false, error: `csvData 过长（>${MAX_CSV_CHARS} 字符）` };
    }

    const title = String(params.title ?? "").trim() || "图表";
    const xLabel = String(params.xLabel ?? "").trim();
    const yLabel = String(params.yLabel ?? "").trim();
    const caption = String(params.caption ?? "").trim() || title;
    const persistToProject = parsePersistToProject(params.persistToProject);

    let extras: Record<string, unknown> = {};
    if (params.configJson) {
      try {
        const parsed = JSON.parse(String(params.configJson)) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          extras = parsed as Record<string, unknown>;
        }
      } catch {
        return { success: false, error: "configJson 必须是 JSON 对象字符串" };
      }
    }

    const config: Record<string, unknown> = {
      chart_type: chartType,
      title,
      ...(xLabel ? { x_label: xLabel } : {}),
      ...(yLabel ? { y_label: yLabel } : {}),
      style: { preset: "nature", dpi: 600, export_formats: "png,svg" },
      ...extras,
    };

    try {
      const generated = await runChartGeneration({
        dataBuffer: Buffer.from(csvData, "utf-8"),
        dataFileName: "agent-data.csv",
        config,
        mode: "generic",
      });

      let persisted: ProjectChartAsset | null = null;
      if (persistToProject) {
        persisted = await persistAgentChart(ctx.userId, ctx.projectId, {
          figureId: chartType,
          caption,
          imageUrl: generated.imageUrl,
          svgUrl: generated.svgUrl,
          pdfUrl: generated.pdfUrl,
          sectionKey: params.sectionKey ? String(params.sectionKey) : undefined,
        });
      }

      return {
        success: true,
        data: {
          chartType,
          imageUrl: generated.imageUrl,
          svgUrl: generated.svgUrl,
          pdfUrl: generated.pdfUrl,
          fileName: generated.fileName,
          persisted,
        },
        summary: persisted
          ? `已生成 ${chartType} 并登记到项目图表库`
          : `已生成 ${chartType}（${generated.fileName}）`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  },
};
