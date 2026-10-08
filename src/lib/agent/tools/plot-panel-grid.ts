import {
  insertOrReplaceAgentSectionImage,
  listAgentCharts,
  persistAgentChart,
} from "@/lib/agent/chart-persist";
import { resolveReplaceForAntiStack } from "@/lib/agent/figure-loop";
import {
  formatInsertSummary,
  resolveInsertSectionKey,
  verifySectionContains,
} from "@/lib/agent/insert-section";
import { parsePanelGrid } from "@/lib/agent/panel-grid";
import { runPanelGeneration, type PanelSpec } from "@/lib/agent/panel-runner";
import {
  alignPeakStack,
  axisForKind,
  collectPeakStackSeries,
  parseStoredSources,
} from "@/lib/agent/peak-stack-series";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import prisma from "@/lib/prisma";
import { parsePersistToProject } from "@/lib/agent/writing-sections";

export const plotPanelGridTool: ToolDefinition = {
  name: "plot_panel_grid",
  description:
    "把多张已入库的谱拼成一张组图（a/b/c 网格），写入图表库。"
    + "每一格用 sourceFileNames 指向已确认入库的文件，kind 用 xrd、ir、raman 或 xps。服务端读曲线，不要把整条谱贴进 csv。"
    + "XPS 只画原始强度对结合能，不自动分峰，也不编 Fe2+、Cu2+ 这类归属。填充组分必须已经是入库数据里的列，并且用户给过名称。"
    + "峰和虚线只画该格 peaks / guides 里写明的位置。没给就不标。"
    + "单张叠谱用 plot_peak_stack。短表柱状图用 generate_chart。改图传 replaceImageUrl。",
  parameters: {
    type: "object",
    properties: {
      panelsJson: {
        type: "string",
        description:
          "2 到 6 格。JSON 数组，或 {cols, panels}。每格 {sourceFileNames, kind, title?, xMin?, xMax?, peaks?, guides?}。"
          + "kind 为 xrd、ir、raman、xps。sourceFileNames 是已入库文件名。",
      },
      title: { type: "string", description: "整张组图的标题，可空" },
      caption: { type: "string", description: "图注，默认同标题" },
      cols: { type: "number", description: "列数 1、2 或 3。六格 XPS 用 2" },
      sectionKey: { type: "string", description: "插入章节；省略则落入已写的 results/methods" },
      replaceImageUrl: { type: "string", description: "改图时旧图 URL，就地替换" },
      replaceChartId: { type: "string", description: "改图时旧图表资产 id" },
      persistToProject: { type: "boolean", description: "写入图表库，默认 true" },
    },
    required: ["panelsJson"],
  },
  safety: "write",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "plot_panel_grid 需要关联项目" };
    }
    const parsed = parsePanelGrid(String(params.panelsJson ?? ""));
    if ("error" in parsed) return { success: false, error: parsed.error };

    const project = await prisma.project.findFirst({
      where: { id: ctx.projectId, userId: ctx.userId },
      select: { dataSources: true },
    });
    if (!project) return { success: false, error: "项目不存在或无权访问" };
    const sources = parseStoredSources(project.dataSources ?? "");

    const panels: PanelSpec[] = [];
    for (let i = 0; i < parsed.panels.length; i++) {
      const panel = parsed.panels[i];
      if (!panel) continue;
      const collected = collectPeakStackSeries(sources, panel.sourceFileNames);
      if (collected.missing.length > 0) {
        return {
          success: false,
          error: `第 ${i + 1} 格对不上已入库的谱：${collected.missing.join("、")}`,
        };
      }
      const aligned = alignPeakStack(collected.series, { xMin: panel.xMin, xMax: panel.xMax });
      if ("error" in aligned) return { success: false, error: `第 ${i + 1} 格：${aligned.error}` };
      const axis = axisForKind(panel.kind, { xLabel: panel.xLabel, yLabel: panel.yLabel });
      const multi = collected.series.length > 1;
      panels.push({
        chartType: "stack_offset",
        csv: aligned.csv,
        title: panel.title,
        xLabel: axis.xLabel,
        yLabel: axis.yLabel,
        xReverse: axis.xReverse,
        offset: multi ? 0.9 : 0,
        normalize: true,
        seriesLabels: multi,
        showLegend: false,
        ...(panel.peaks.length > 0 ? { peaks: panel.peaks } : {}),
        ...(panel.guides.length > 0 ? { guides: panel.guides } : {}),
      });
    }

    const title = String(params.title ?? "").trim() || "组图";
    const caption = String(params.caption ?? "").trim() || title;
    const colsParam = Number(params.cols);
    const cols = colsParam === 1 || colsParam === 2 || colsParam === 3
      ? colsParam
      : parsed.cols ?? (panels.length >= 4 ? 2 : undefined);
    const resolved = resolveInsertSectionKey(params.sectionKey, ctx.projectSnapshot);
    if ("error" in resolved) return { success: false, error: resolved.error };

    const existingCharts = await listAgentCharts(ctx.projectId);
    const anti = resolveReplaceForAntiStack({
      params: { ...params, title, caption, sectionKey: resolved.sectionKey },
      charts: existingCharts,
    });
    const replaceImageUrl = String(anti.params.replaceImageUrl ?? "").trim() || undefined;
    const replaceChartId = String(anti.params.replaceChartId ?? "").trim() || undefined;

    try {
      const generated = await runPanelGeneration({
        title,
        preset: "nature",
        ...(cols ? { cols } : {}),
        panels,
      });

      let insertedSection: string | undefined;
      let verifiedInBody: boolean | undefined;
      let insertMode: "replaced" | "appended" | undefined;
      if (resolved.sectionKey) {
        const ins = await insertOrReplaceAgentSectionImage(ctx.userId, ctx.projectId, {
          sectionKey: resolved.sectionKey,
          caption,
          imageUrl: generated.imageUrl,
          replaceImageUrl,
          replaceChartId,
        });
        insertMode = ins.mode;
        insertedSection = resolved.sectionKey;
        const seen = await verifySectionContains(ctx.projectId, resolved.sectionKey, generated.imageUrl);
        verifiedInBody = seen.verifiedInBody;
      }

      const persisted = parsePersistToProject(params.persistToProject)
        ? await persistAgentChart(ctx.userId, ctx.projectId, {
          figureId: "panel_grid",
          caption,
          imageUrl: generated.imageUrl,
          sectionKey: resolved.sectionKey,
        })
        : null;

      const bits = [
        `已生成 ${generated.panelCount} 格组图「${title}」`,
        "每一格只画了入库曲线。XPS 没有自动分峰。",
      ];
      if (persisted) bits.push("已登记到项目图表库");
      if (insertMode === "replaced") bits.push(`已就地替换章节 ${insertedSection} 中的旧图`);
      else if (insertedSection) {
        bits.push(formatInsertSummary({
          inferred: resolved.inferred === true,
          insertedSection,
          verifiedInBody,
        }));
      }
      bits.push(`若改图请带 replaceImageUrl="${generated.imageUrl}"`);

      return {
        success: true,
        data: {
          imageUrl: generated.imageUrl,
          title,
          caption,
          figureId: "panel_grid",
          panelCount: generated.panelCount,
          insertedSection,
          verifiedInBody,
          insertMode,
          inferredSection: resolved.inferred === true,
          persisted: persisted ?? false,
          replaceImageUrl,
        },
        summary: bits.join("。"),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  },
};
