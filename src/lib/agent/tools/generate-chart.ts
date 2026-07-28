import type { ChartType } from "@/contracts/data-source";
import type { ProjectChartAsset } from "@/contracts/figure";
import {
  buildChartReplayFigureSpec,
  chartTypeToFigureId,
  encodeChartAssetReplay,
} from "@/contracts/figure";
import { persistAgentChart } from "@/lib/agent/chart-persist";
import {
  loadAgentPlotSources,
  resolvePlotCandidate,
} from "@/lib/agent/plot-sources";
import { appendAgentSectionMarkdown } from "@/lib/agent/project-persist";
import {
  AGENT_WRITING_SECTIONS,
  isAgentWritingSectionKey,
  parsePersistToProject,
} from "@/lib/agent/writing-sections";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import { parseChartTabular } from "@/lib/chart-tabular-parse";
import {
  AGENT_CHART_TYPES,
  isAgentChartType,
  runChartGeneration,
} from "@/lib/chart-runner";

const MAX_CSV_CHARS = 100_000;

function normalizeChartType(raw: string): string {
  const t = raw.trim();
  if (isAgentChartType(t)) return t;
  if (t === "bar" || t === "grouped_bar" || t === "box") {
    return chartTypeToFigureId(t === "grouped_bar" ? "grouped_bar" : "bar");
  }
  if (t === "line" || t === "scatter") {
    return chartTypeToFigureId(t as ChartType);
  }
  return t;
}

function buildFigureSpecEnc(params: {
  csvData: string;
  chartType: string;
  title: string;
  caption: string;
  xLabel: string;
  yLabel: string;
  style?: Record<string, unknown>;
}): string | undefined {
  const parsed = parseChartTabular(params.csvData, params.chartType);
  if (!parsed) return undefined;
  const spec = buildChartReplayFigureSpec({
    caption: params.caption,
    chartType: params.chartType,
    title: params.title,
    xLabel: params.xLabel,
    yLabel: params.yLabel,
    style: params.style,
    parsedData: parsed,
  });
  return spec ? encodeChartAssetReplay(spec) : undefined;
}

export const generateChartTool: ToolDefinition = {
  name: "generate_chart",
  description:
    "生成科学图表并默认写入项目图表库。优先：先 list_plot_sources，再 generate_chart(chartIndex=N)。传 sectionKey（如 results）会把图插入该章节正文。也可直接传 csvData+chartType。无数据时不要编造数值",
  parameters: {
    type: "object",
    properties: {
      chartIndex: {
        type: "number",
        description: "list_plot_sources 返回的候选 index（优先；有则无需 csvData）",
      },
      chartType: {
        type: "string",
        description: "registry 图表类型 id（手写 CSV 时必填）",
        enum: [...AGENT_CHART_TYPES],
      },
      csvData: {
        type: "string",
        description: "CSV 数据（首行为表头），例：温度,N₂,CO₂\\n500,44,44",
      },
      title: { type: "string", description: "图表标题（可覆盖推荐配置）" },
      xLabel: { type: "string", description: "X 轴标签" },
      yLabel: { type: "string", description: "Y 轴标签" },
      caption: {
        type: "string",
        description: "图注/说明（写入项目资产时使用，默认同 title）",
      },
      sectionKey: {
        type: "string",
        description:
          "可选：论文章节 key（如 results）。提供则插入 Markdown 图片到该章节并关联资产",
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
    required: [],
  },
  safety: "write",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "generate_chart 需要关联 projectId" };
    }

    let chartType = String(params.chartType ?? "").trim();
    let csvData = String(params.csvData ?? "").trim();
    let title = String(params.title ?? "").trim();
    let xLabel = String(params.xLabel ?? "").trim();
    let yLabel = String(params.yLabel ?? "").trim();

    const rawIndex = Number(params.chartIndex);
    if (Number.isFinite(rawIndex)) {
      const bundle = await loadAgentPlotSources(ctx.userId, ctx.projectId);
      if (!bundle) {
        return { success: false, error: "项目不存在或无权访问" };
      }
      const resolved = resolvePlotCandidate(bundle, Math.floor(rawIndex));
      if ("error" in resolved) {
        return { success: false, error: resolved.error };
      }
      csvData = resolved.csv;
      chartType = resolved.figureId;
      if (!title) title = resolved.cfg.title;
      if (!xLabel && resolved.cfg.xLabel) xLabel = resolved.cfg.xLabel;
      if (!yLabel && resolved.cfg.yLabel) yLabel = resolved.cfg.yLabel;
    }

    if (!csvData) {
      return {
        success: false,
        error:
          "缺少数据：请先 list_plot_sources 后传 chartIndex，或提供 csvData+chartType；不要编造数值",
      };
    }
    if (csvData.length > MAX_CSV_CHARS) {
      return { success: false, error: `csvData 过长（>${MAX_CSV_CHARS} 字符）` };
    }

    chartType = normalizeChartType(chartType);
    if (!isAgentChartType(chartType)) {
      return {
        success: false,
        error: `无效 chartType: ${chartType || "（空）"}。手写 CSV 时必填合法类型`,
      };
    }

    title = title || "图表";
    const caption = String(params.caption ?? "").trim() || title;
    const persistToProject = parsePersistToProject(params.persistToProject);
    const sectionKeyRaw = params.sectionKey ? String(params.sectionKey).trim() : "";
    const sectionKey =
      sectionKeyRaw && isAgentWritingSectionKey(sectionKeyRaw)
        ? sectionKeyRaw
        : sectionKeyRaw
          ? null
          : undefined;
    if (sectionKeyRaw && sectionKey === null) {
      return {
        success: false,
        error: `无效 sectionKey: ${sectionKeyRaw}。可用：${AGENT_WRITING_SECTIONS.join(", ")}`,
      };
    }

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

    const style = { preset: "nature", dpi: 600, export_formats: "png,svg" };
    const config: Record<string, unknown> = {
      chart_type: chartType,
      title,
      ...(xLabel ? { x_label: xLabel } : {}),
      ...(yLabel ? { y_label: yLabel } : {}),
      style,
      ...extras,
    };

    try {
      const generated = await runChartGeneration({
        dataBuffer: Buffer.from(csvData, "utf-8"),
        dataFileName: "agent-data.csv",
        config,
        mode: "generic",
      });

      const figureSpecEnc = buildFigureSpecEnc({
        csvData,
        chartType,
        title,
        caption,
        xLabel,
        yLabel,
        style: isRecord(extras.style) ? (extras.style as Record<string, unknown>) : style,
      });

      let persisted: ProjectChartAsset | null = null;
      let insertedSection: string | undefined;

      if (persistToProject) {
        persisted = await persistAgentChart(ctx.userId, ctx.projectId, {
          figureId: chartType,
          caption,
          imageUrl: generated.imageUrl,
          svgUrl: generated.svgUrl,
          pdfUrl: generated.pdfUrl,
          sectionKey: sectionKey ?? undefined,
          figureSpecEnc,
        });
      }

      if (sectionKey) {
        const md = `\n\n![${caption}](${generated.imageUrl})\n\n`;
        await appendAgentSectionMarkdown(
          ctx.userId,
          ctx.projectId,
          sectionKey,
          md,
        );
        insertedSection = sectionKey;
      }

      const bits = [`已生成 ${chartType}「${title}」`];
      if (persisted) bits.push("已登记到项目图表库");
      if (insertedSection) bits.push(`已插入章节 ${insertedSection}`);
      if (figureSpecEnc) bits.push("可回放编辑");

      return {
        success: true,
        data: {
          chartType,
          chartIndex: Number.isFinite(rawIndex) ? Math.floor(rawIndex) : undefined,
          imageUrl: generated.imageUrl,
          svgUrl: generated.svgUrl,
          pdfUrl: generated.pdfUrl,
          fileName: generated.fileName,
          persisted,
          insertedSection,
          hasReplay: Boolean(figureSpecEnc),
        },
        summary: bits.join("；"),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
