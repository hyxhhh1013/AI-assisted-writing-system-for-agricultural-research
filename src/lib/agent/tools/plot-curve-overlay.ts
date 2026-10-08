import {
  insertOrReplaceAgentSectionImage,
  listAgentCharts,
  persistAgentChart,
} from "@/lib/agent/chart-persist";
import { chartSpecToFigureSpec } from "@/contracts/chart-spec";
import { encodeChartAssetReplay } from "@/contracts/figure";
import { resolveReplaceForAntiStack } from "@/lib/agent/figure-loop";
import {
  formatInsertSummary,
  resolveInsertSectionKey,
  verifySectionContains,
} from "@/lib/agent/insert-section";
import {
  axisForOverlay,
  defaultTransform,
  isOverlayKind,
  overlayLongCsv,
  prepareOverlaySeries,
  type OverlayTransform,
} from "@/lib/agent/curve-overlay";
import {
  collectPeakStackSeries,
  parseSourceFileNames,
  parseStoredSources,
} from "@/lib/agent/peak-stack-series";
import { compileChartSpec } from "@/lib/chart-spec-compiler";
import { runChartGeneration } from "@/lib/chart-runner";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import prisma from "@/lib/prisma";
import { parsePersistToProject } from "@/lib/agent/writing-sections";

function parseStringList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean);
  const text = String(raw ?? "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    /* 逗号分隔 */
  }
  return text.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
}

function parseRates(raw: unknown): { rates: Record<string, number> } | { error: string } {
  const text = String(raw ?? "").trim();
  if (!text) return { rates: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "ratesJson 不是合法 JSON" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { error: "ratesJson 必须是 {文件名: 升温速率}" };
  }
  const rates: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate <= 0) {
      return { error: `升温速率必须是正数：${key}` };
    }
    rates[key.trim()] = rate;
  }
  return { rates };
}

function parseTransform(raw: unknown, fallback: OverlayTransform): OverlayTransform | { error: string } {
  const text = String(raw ?? "").trim();
  if (!text) return fallback;
  if (text === "none" || text === "mass_percent" || text === "dtg" || text === "dv_dlog") return text;
  return { error: "yTransform 只能是 none、mass_percent、dtg 或 dv_dlog" };
}

export const plotCurveOverlayTool: ToolDefinition = {
  name: "plot_curve_overlay",
  description:
    "把多条已入库曲线画在同一坐标上，写入图表库。用于热重、DTG、氮气吸附等温线、孔径分布。"
    + "kind=tg 默认把质量换成起点的百分比；kind=dtg 对这条百分比做差分。要纵轴变成 %/min，用 ratesJson 给出每个文件的升温速率（°C/min），没给就标成 %/°C。"
    + "kind=bet 按入库的相对压力和吸附量画，保留吸附—脱附回线，不计算比表面积。"
    + "kind=pore 用对数孔径轴。y 默认原样；只有确认入库的 y 是 dV/dD 时才传 yTransform=dv_dlog。"
    + "按 sourceFileNames 读已确认的文件，不要把整条曲线贴进 csv。纵向叠谱用 plot_peak_stack，多格组图用 plot_panel_grid。改图传 replaceImageUrl。",
  parameters: {
    type: "object",
    properties: {
      sourceFileNames: { type: "string", description: "已入库文件名，JSON 数组或逗号分隔" },
      kind: { type: "string", description: "tg、dtg、bet 或 pore。只决定默认坐标和换算，不编机理。" },
      labelsJson: { type: "string", description: "与文件名等长的显示名，如 [\"5 °C/min\",\"10 °C/min\"]。不传就用文件名。" },
      ratesJson: { type: "string", description: "DTG 用。{文件名: 升温速率°C/min}。给出后纵轴为 %/min。" },
      yTransform: { type: "string", description: "覆盖默认换算：none、mass_percent、dtg、dv_dlog" },
      title: { type: "string", description: "图标题，可空" },
      caption: { type: "string", description: "图注，默认同标题" },
      xLabel: { type: "string", description: "横轴标签，不传用 kind 的默认" },
      yLabel: { type: "string", description: "纵轴标签，不传用 kind 的默认" },
      xMin: { type: "number", description: "横轴下限" },
      xMax: { type: "number", description: "横轴上限" },
      sectionKey: { type: "string", description: "插入章节；省略则落入已写的 results/methods" },
      replaceImageUrl: { type: "string", description: "改图时旧图 URL" },
      replaceChartId: { type: "string", description: "改图时旧图表资产 id" },
      persistToProject: { type: "boolean", description: "写入图表库，默认 true" },
    },
    required: ["sourceFileNames", "kind"],
  },
  safety: "write",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) return { success: false, error: "plot_curve_overlay 需要关联项目" };
    const kindRaw = String(params.kind ?? "").trim().toLowerCase();
    if (!isOverlayKind(kindRaw)) return { success: false, error: "kind 只能是 tg、dtg、bet 或 pore" };
    const names = parseSourceFileNames(String(params.sourceFileNames ?? ""));
    if (names.length === 0) return { success: false, error: "请给出已入库的文件名 sourceFileNames" };
    const transform = parseTransform(params.yTransform, defaultTransform(kindRaw));
    if (typeof transform !== "string") return { success: false, error: transform.error };
    const parsedRates = parseRates(params.ratesJson);
    if ("error" in parsedRates) return { success: false, error: parsedRates.error };
    const rates = parsedRates.rates;
    const labels = parseStringList(params.labelsJson);

    const project = await prisma.project.findFirst({
      where: { id: ctx.projectId, userId: ctx.userId },
      select: { dataSources: true },
    });
    if (!project) return { success: false, error: "项目不存在或无权访问" };
    const collected = collectPeakStackSeries(parseStoredSources(project.dataSources ?? ""), names);
    if (collected.missing.length > 0) {
      return { success: false, error: `这些文件还没有可画的曲线：${collected.missing.join("、")}` };
    }

    const named = collected.series.map((item, index) => (
      labels[index] ? { ...item, name: labels[index] ?? item.name } : item
    ));
    const rateList = names.map((name) => rates[name]);
    const perMinute = transform === "dtg"
      && named.length === names.length
      && rateList.every((rate) => rate != null && rate > 0);
    const prepared = prepareOverlaySeries(
      named,
      transform,
      perMinute ? rateList : named.map(() => undefined),
    );
    if (prepared.length === 0) return { success: false, error: "曲线点数不够" };

    const xMin = Number(params.xMin);
    const xMax = Number(params.xMax);
    const cropped = prepared.map((item) => {
      if (!Number.isFinite(xMin) && !Number.isFinite(xMax)) return item;
      const x: number[] = [];
      const y: number[] = [];
      for (let i = 0; i < item.x.length; i++) {
        const xv = item.x[i] ?? 0;
        if (Number.isFinite(xMin) && xv < xMin) continue;
        if (Number.isFinite(xMax) && xv > xMax) continue;
        x.push(xv);
        y.push(item.y[i] ?? 0);
      }
      return { name: item.name, x, y };
    }).filter((item) => item.x.length >= 2);
    if (cropped.length === 0) return { success: false, error: "裁剪后没有点" };

    const axis = axisForOverlay(kindRaw, transform, perMinute);
    const xLabel = String(params.xLabel ?? "").trim() || axis.xLabel;
    const yLabel = String(params.yLabel ?? "").trim() || axis.yLabel;
    const title = String(params.title ?? "").trim() || (
      kindRaw === "tg" ? "TG" : kindRaw === "dtg" ? "DTG" : kindRaw === "pore" ? "Pore size" : "Isotherm"
    );
    const caption = String(params.caption ?? "").trim() || title;
    const csv = overlayLongCsv(cropped);
    const config = {
      chart_type: "line",
      title,
      x_label: xLabel,
      y_label: yLabel,
      long_xy: true,
      x_log: axis.xLog,
      use_markers: axis.markers,
      show_legend: true,
      unitless: true,
      preset: "nature",
    };

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
      const generated = await runChartGeneration({
        dataBuffer: Buffer.from(csv, "utf-8"),
        dataFileName: "curve-overlay.csv",
        config,
        mode: "generic",
      });
      if (generated.qaReport?.verdict === "block") {
        const messages = generated.qaReport.findings?.map((item) => item.message).filter(Boolean) ?? [];
        return {
          success: false,
          error: `曲线图未通过出图质检${messages.length ? `：${messages.join("；")}` : ""}`,
          data: { qaReport: generated.qaReport, blocked: true },
        };
      }
      const compiled = compileChartSpec({
        chartType: "line",
        csv,
        title,
        caption,
        xLabel,
        yLabel,
        unitless: true,
        preset: "nature",
        extras: config,
      });
      const figureSpecEnc = encodeChartAssetReplay(chartSpecToFigureSpec(generated.chartSpec ?? compiled.spec));

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
        verifiedInBody = (await verifySectionContains(ctx.projectId, resolved.sectionKey, generated.imageUrl)).verifiedInBody;
      }
      const persisted = parsePersistToProject(params.persistToProject)
        ? await persistAgentChart(ctx.userId, ctx.projectId, {
          figureId: "line",
          caption,
          imageUrl: generated.imageUrl,
          svgUrl: generated.svgUrl,
          pdfUrl: generated.pdfUrl,
          sectionKey: resolved.sectionKey,
          figureSpecEnc,
        })
        : null;

      const transformNote = transform === "mass_percent"
        ? "质量已换成相对起点的百分比。"
        : transform === "dtg"
          ? (perMinute ? "DTG 用了给出的升温速率，纵轴是每分钟。" : "没有升温速率，纵轴是每摄氏度。若要 %/min，请给 ratesJson。")
          : transform === "dv_dlog"
            ? "已按 dV/dD × D × ln(10) 换成 dV/dlog10(D)。"
            : "纵轴用的是入库原值。";
      const bits = [
        `已生成${cropped.length} 条曲线的「${title}」`,
        transformNote,
      ];
      if (collected.truncated) bits.push("只画了前 12 条");
      if (persisted) bits.push("已登记到项目图表库");
      if (insertMode === "replaced") bits.push(`已就地替换章节 ${insertedSection} 中的旧图`);
      else if (insertedSection) {
        bits.push(formatInsertSummary({
          inferred: resolved.inferred === true,
          insertedSection,
          verifiedInBody,
        }));
      }
      if (generated.imageUrl) bits.push(`若改图请带 replaceImageUrl="${generated.imageUrl}"`);
      return {
        success: true,
        data: {
          imageUrl: generated.imageUrl,
          svgUrl: generated.svgUrl,
          pdfUrl: generated.pdfUrl,
          title,
          caption,
          kind: kindRaw,
          figureId: "line",
          figureSpecEnc,
          transform,
          insertedSection,
          verifiedInBody,
          insertMode,
          persisted: persisted ?? false,
          replaceImageUrl,
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
