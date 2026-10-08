import { chartSpecToFigureSpec } from "@/contracts/chart-spec";
import { encodeChartAssetReplay } from "@/contracts/figure";
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
import {
  alignPeakStack,
  axisForKind,
  collectPeakStackSeries,
  isPeakStackKind,
  parseGuideMarks,
  parsePeakMarks,
  parseSourceFileNames,
  parseStoredSources,
} from "@/lib/agent/peak-stack-series";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import { compileChartSpec } from "@/lib/chart-spec-compiler";
import { runChartGeneration } from "@/lib/chart-runner";
import prisma from "@/lib/prisma";
import { parsePersistToProject } from "@/lib/agent/writing-sections";

function asNumber(raw: unknown): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export const plotPeakStackTool: ToolDefinition = {
  name: "plot_peak_stack",
  description:
    "把已经确认入库的 XRD 或红外曲线画成纵向偏移叠谱，写入图表库。"
    + "服务端按 sourceFileNames 读取入库曲线，不要把整条谱贴进 csvData，也不要改用 generate_chart。"
    + "kind=xrd 默认 2θ、强度；kind=ir 默认波数从高到低、吸光度；kind=raman 为拉曼位移；kind=xps 为结合能从高到低的原始谱，不画未给出的分峰。"
    + "peaksJson 只标用户说过的位置：[{x, label, marker?, series?}]，marker 用 diamond/triangle/star/circle。"
    + "guidesJson 只画用户说过的虚线：[{x, label}]。没给峰就只画叠谱，然后问用户要标哪里。"
    + "禁止自己编 Fe2+、O-H 这类归属，也不要把峰标写进证据声明。"
    + "改图传 replaceImageUrl 就地替换。文件名对不上已入库的块时会失败并指出缺哪一块。",
  parameters: {
    type: "object",
    properties: {
      sourceFileNames: {
        type: "string",
        description: "已入库的文件名或「文件名 · 块名」，JSON 数组或逗号分隔。一次最多 12 条谱。",
      },
      kind: {
        type: "string",
        description: "xrd、ir、raman 或 xps。只决定默认坐标轴，不决定峰的化学归属。",
      },
      title: { type: "string", description: "图题，可空" },
      caption: { type: "string", description: "图注，默认同图题" },
      xLabel: { type: "string", description: "覆盖默认横轴标题" },
      yLabel: { type: "string", description: "覆盖默认纵轴标题" },
      xMin: { type: "number", description: "横轴下限，可空" },
      xMax: { type: "number", description: "横轴上限，可空" },
      peaksJson: {
        type: "string",
        description: "用户点名的峰：JSON 数组 [{x, label, marker?, series?}]。没有就不要传。",
      },
      guidesJson: {
        type: "string",
        description: "用户点名的竖直参考线：JSON 数组 [{x, label}]。没有就不要传。",
      },
      sectionKey: { type: "string", description: "插入章节；省略则落入已写的 results/methods" },
      replaceImageUrl: { type: "string", description: "改图时旧图 URL，就地替换" },
      replaceChartId: { type: "string", description: "改图时旧图表资产 id" },
      persistToProject: { type: "boolean", description: "写入图表库，默认 true" },
    },
    required: ["sourceFileNames", "kind"],
  },
  safety: "write",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "plot_peak_stack 需要关联项目" };
    }
    const kindRaw = String(params.kind ?? "").trim().toLowerCase();
    if (!isPeakStackKind(kindRaw)) {
      return { success: false, error: "kind 只能是 xrd、ir、raman 或 xps" };
    }
    const names = parseSourceFileNames(String(params.sourceFileNames ?? ""));
    if (names.length === 0) {
      return { success: false, error: "请给出已入库的文件名 sourceFileNames" };
    }
    const peaks = parsePeakMarks(String(params.peaksJson ?? ""));
    if ("error" in peaks) return { success: false, error: peaks.error };
    const guides = parseGuideMarks(String(params.guidesJson ?? ""));
    if ("error" in guides) return { success: false, error: guides.error };

    const project = await prisma.project.findFirst({
      where: { id: ctx.projectId, userId: ctx.userId },
      select: { dataSources: true },
    });
    if (!project) return { success: false, error: "项目不存在或无权访问" };

    const collected = collectPeakStackSeries(parseStoredSources(project.dataSources ?? ""), names);
    if (collected.missing.length > 0) {
      return {
        success: false,
        error: `这些名字对不上已入库的谱：${collected.missing.join("、")}。请用数据里显示的文件名，不要另起名字。`,
      };
    }
    if (collected.series.length === 0) {
      return {
        success: false,
        error: "这些文件里没有完整曲线。请先确认入库，让曲线留在项目里，再画叠谱。",
      };
    }

    const xMin = asNumber(params.xMin);
    const xMax = asNumber(params.xMax);
    const aligned = alignPeakStack(collected.series, { xMin, xMax });
    if ("error" in aligned) return { success: false, error: aligned.error };

    const axis = axisForKind(kindRaw, {
      xLabel: String(params.xLabel ?? ""),
      yLabel: String(params.yLabel ?? ""),
    });
    const title = String(params.title ?? "").trim() || (
      kindRaw === "ir" ? "FTIR" : kindRaw === "raman" ? "Raman" : kindRaw === "xps" ? "XPS" : "XRD"
    );
    const caption = String(params.caption ?? "").trim() || title;
    const resolved = resolveInsertSectionKey(params.sectionKey, ctx.projectSnapshot);
    if ("error" in resolved) return { success: false, error: resolved.error };

    const existingCharts = await listAgentCharts(ctx.projectId);
    const anti = resolveReplaceForAntiStack({
      params: {
        ...params,
        title,
        caption,
        sectionKey: resolved.sectionKey,
      },
      charts: existingCharts,
    });
    const replaceImageUrl = String(anti.params.replaceImageUrl ?? "").trim() || undefined;
    const replaceChartId = String(anti.params.replaceChartId ?? "").trim() || undefined;

    const config: Record<string, unknown> = {
      chart_type: "stack_offset",
      title,
      caption,
      x_label: axis.xLabel,
      y_label: axis.yLabel,
      offset: 0.9,
      normalize: true,
      series_labels: true,
      show_legend: false,
      x_reverse: axis.xReverse,
      peaks: peaks.peaks,
      guides: guides.guides,
      unitless: true,
      preset: "nature",
    };

    try {
      const generated = await runChartGeneration({
        dataBuffer: Buffer.from(aligned.csv, "utf-8"),
        dataFileName: "peak-stack.csv",
        config,
        mode: "generic",
      });
      const blocked = generated.qaReport?.verdict === "block";
      if (blocked) {
        const messages = generated.qaReport?.findings?.map((item) => item.message).filter(Boolean) ?? [];
        return {
          success: false,
          error: `叠谱未通过出图质检${messages.length ? `：${messages.join("；")}` : ""}`,
          data: { qaReport: generated.qaReport, blocked: true },
        };
      }

      const compiled = compileChartSpec({
        chartType: "stack_offset",
        csv: aligned.csv,
        title,
        caption,
        xLabel: axis.xLabel,
        yLabel: axis.yLabel,
        unitless: true,
        preset: "nature",
        extras: config,
      });
      const figureSpecEnc = encodeChartAssetReplay(
        chartSpecToFigureSpec(generated.chartSpec ?? compiled.spec),
      );

      let insertedSection: string | undefined;
      let verifiedInBody: boolean | undefined;
      let insertMode: "replaced" | "appended" | undefined;
      if (resolved.sectionKey) {
        const ins = await insertOrReplaceAgentSectionImage(
          ctx.userId,
          ctx.projectId,
          {
            sectionKey: resolved.sectionKey,
            caption,
            imageUrl: generated.imageUrl,
            replaceImageUrl,
            replaceChartId,
          },
        );
        insertMode = ins.mode;
        insertedSection = resolved.sectionKey;
        const seen = await verifySectionContains(ctx.projectId, resolved.sectionKey, generated.imageUrl);
        verifiedInBody = seen.verifiedInBody;
      }

      const persisted = parsePersistToProject(params.persistToProject)
        ? await persistAgentChart(ctx.userId, ctx.projectId, {
          figureId: "stack_offset",
          caption,
          imageUrl: generated.imageUrl,
          svgUrl: generated.svgUrl,
          pdfUrl: generated.pdfUrl,
          sectionKey: resolved.sectionKey,
          figureSpecEnc,
        })
        : null;

      const markNote = peaks.peaks.length === 0 && guides.guides.length === 0
        ? "只画了叠谱，没有标峰。请向用户问要标的位置和名称，不要自己编化学归属。"
        : `已按参数标了 ${peaks.peaks.length} 个峰、${guides.guides.length} 条参考线。名称只来自参数。`;
      const bits = [
        `已生成${kindRaw === "ir" ? "红外" : kindRaw === "raman" ? "拉曼" : kindRaw === "xps" ? "XPS" : "XRD"}叠谱「${title}」`,
        `${collected.series.length} 条谱，横轴 ${aligned.xMin.toFixed(1)}–${aligned.xMax.toFixed(1)}`,
        markNote,
      ];
      if (collected.truncated) bits.push("只画了前 12 条谱");
      if (persisted) bits.push("已登记到项目图表库");
      if (insertMode === "replaced") bits.push(`已就地替换章节 ${insertedSection} 中的旧图`);
      else if (insertedSection) {
        bits.push(formatInsertSummary({
          inferred: resolved.inferred === true,
          insertedSection,
          verifiedInBody,
        }));
      }
      if (generated.imageUrl) {
        bits.push(`若改图请带 replaceImageUrl="${generated.imageUrl}"`);
      }

      return {
        success: true,
        data: {
          imageUrl: generated.imageUrl,
          svgUrl: generated.svgUrl,
          pdfUrl: generated.pdfUrl,
          title,
          caption,
          kind: kindRaw,
          figureId: "stack_offset",
          figureSpecEnc,
          insertedSection,
          verifiedInBody,
          insertMode,
          inferredSection: resolved.inferred === true,
          persisted: persisted ?? false,
          replaceImageUrl,
          peakCount: peaks.peaks.length,
          guideCount: guides.guides.length,
          qaReport: generated.qaReport,
        },
        summary: bits.join("。"),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  },
};
