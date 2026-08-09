import type { ChartType } from "@/contracts/data-source";
import type { ProjectChartAsset } from "@/contracts/figure";
import {
  buildChartReplayFigureSpec,
  chartTypeToFigureId,
  encodeChartAssetReplay,
} from "@/contracts/figure";
import {
  insertOrReplaceAgentSectionImage,
  listAgentCharts,
  persistAgentChart,
  removeAgentChart,
} from "@/lib/agent/chart-persist";
import { resolveReplaceForAntiStack } from "@/lib/agent/figure-loop";
import {
  loadAgentPlotSources,
  resolvePlotCandidate,
  type AgentPlotSourcesBundle,
} from "@/lib/agent/plot-sources";
import { runPanelGeneration, type PanelSpec } from "@/lib/agent/panel-runner";
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
const MAX_BATCH_CHARTS = 6;

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

export function parseChartIndices(params: Record<string, unknown>): number[] {
  const out: number[] = [];
  const push = (n: unknown) => {
    // Number(null)=0 / Number("")=0 / Number(true)=1 会被误当成图表下标，显式排除
    if (n === null || n === undefined) return;
    if (typeof n === "boolean") return;
    if (typeof n === "string" && n.trim() === "") return;
    const v = Number(n);
    if (Number.isFinite(v)) out.push(Math.floor(v));
  };

  if (params.chartIndices != null) {
    const raw = params.chartIndices;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) parsed.forEach(push);
      } catch {
        String(raw)
          .split(/[,，\s]+/)
          .filter(Boolean)
          .forEach(push);
      }
    } else if (Array.isArray(raw)) {
      raw.forEach(push);
    }
  }

  if (out.length === 0 && params.chartIndex != null) {
    push(params.chartIndex);
  }

  return [...new Set(out)];
}

/** 解析多面板复合图参数（panelsJson） */
export function parsePanelsJson(raw: unknown): { panels: PanelSpec[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { error: "panelsJson 必须是 JSON 数组" };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: "panelsJson 至少需要 1 个面板" };
  }
  if (parsed.length > MAX_BATCH_CHARTS) {
    return { error: `一次最多 ${MAX_BATCH_CHARTS} 个面板` };
  }
  const panels: PanelSpec[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    if (!p || typeof p !== "object") {
      return { error: `panels[${i}] 不是对象` };
    }
    const o = p as Record<string, unknown>;
    const chartType = normalizeChartType(String(o.chartType ?? "").trim());
    if (!chartType || !isAgentChartType(chartType)) {
      return {
        error:
          `panels[${i}] 无效 chartType: ${String(o.chartType ?? "").trim() || "（空）"}。`
          + `可用：${AGENT_CHART_TYPES.join(", ")}`,
      };
    }
    const csv = String(o.csv ?? "").trim();
    if (!csv) {
      return { error: `panels[${i}] 缺 csv 数据` };
    }
    panels.push({
      chartType,
      csv,
      title: String(o.title ?? "").trim(),
      xLabel: String(o.xLabel ?? o.x_label ?? "").trim(),
      yLabel: String(o.yLabel ?? o.y_label ?? "").trim(),
    });
  }
  return { panels };
}

async function generateOneChart(input: {
  ctx: AgentContext;
  csvData: string;
  chartType: string;
  title: string;
  xLabel: string;
  yLabel: string;
  caption: string;
  sectionKey?: string;
  persistToProject: boolean;
  extras: Record<string, unknown>;
  chartIndex?: number;
  /** 期刊样式预设：nature（通用/Nature 风）/ agr_journal（农业期刊双栏）/ print_bw（黑白打印） */
  preset?: "nature" | "agr_journal" | "print_bw";
  replaceImageUrl?: string;
  replaceChartId?: string;
}): Promise<{
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
  summary?: string;
}> {
  const chartType = normalizeChartType(input.chartType);
  if (!isAgentChartType(chartType)) {
    return {
      success: false,
      error: `无效 chartType: ${chartType || "（空）"}。手写 CSV 时必填合法类型`,
    };
  }
  if (!input.csvData) {
    return {
      success: false,
      error: "缺少数据：请先 list_plot_sources 后传 chartIndex，或提供 csvData+chartType",
    };
  }
  if (input.csvData.length > MAX_CSV_CHARS) {
    return { success: false, error: `csvData 过长（>${MAX_CSV_CHARS} 字符）` };
  }

  const title = input.title || "图表";
  const caption = input.caption || title;
  const style = {
    preset: input.preset || "nature",
    dpi: 600,
    export_formats: "png,svg",
  };
  const config: Record<string, unknown> = {
    chart_type: chartType,
    title,
    ...(input.xLabel ? { x_label: input.xLabel } : {}),
    ...(input.yLabel ? { y_label: input.yLabel } : {}),
    style,
    ...input.extras,
  };

  try {
    const generated = await runChartGeneration({
      dataBuffer: Buffer.from(input.csvData, "utf-8"),
      dataFileName: "agent-data.csv",
      config,
      mode: "generic",
    });

    const figureSpecEnc = buildFigureSpecEnc({
      csvData: input.csvData,
      chartType,
      title,
      caption,
      xLabel: input.xLabel,
      yLabel: input.yLabel,
      style: isRecord(input.extras.style)
        ? (input.extras.style as Record<string, unknown>)
        : style,
    });

    let persisted: ProjectChartAsset | null = null;
    let insertedSection: string | undefined;

    let insertMode: "replaced" | "appended" | undefined;
    if (input.sectionKey) {
      const ins = await insertOrReplaceAgentSectionImage(
        input.ctx.userId,
        input.ctx.projectId!,
        {
          sectionKey: input.sectionKey,
          caption,
          imageUrl: generated.imageUrl,
          replaceImageUrl: input.replaceImageUrl,
          replaceChartId: input.replaceChartId,
        },
      );
      insertMode = ins.mode;
      insertedSection = input.sectionKey;
    }

    if (input.persistToProject) {
      persisted = await persistAgentChart(input.ctx.userId, input.ctx.projectId!, {
        figureId: chartType,
        caption,
        imageUrl: generated.imageUrl,
        svgUrl: generated.svgUrl,
        pdfUrl: generated.pdfUrl,
        sectionKey: input.sectionKey,
        figureSpecEnc,
      });
    }

    const href =
      figureSpecEnc && input.ctx.projectId
        ? `/plot?id=${encodeURIComponent(input.ctx.projectId)}`
          + `&figure=${encodeURIComponent(chartType)}`
          + `&figureSpec=${figureSpecEnc}`
          + `&replaceImageUrl=${encodeURIComponent(generated.imageUrl)}`
        : undefined;

    const bits = [`已生成 ${chartType}「${title}」`];
    if (persisted) bits.push("已登记到项目图表库");
    if (insertMode === "replaced") bits.push(`已就地替换章节 ${insertedSection} 中的旧图`);
    else if (insertedSection) bits.push(`已插入章节 ${insertedSection}`);
    if (figureSpecEnc) bits.push("可回放编辑");

    return {
      success: true,
      data: {
        chartType,
        chartIndex: input.chartIndex,
        imageUrl: generated.imageUrl,
        svgUrl: generated.svgUrl,
        pdfUrl: generated.pdfUrl,
        fileName: generated.fileName,
        persisted,
        insertedSection,
        insertMode,
        hasReplay: Boolean(figureSpecEnc),
        href,
        figureSpecEnc,
      },
      summary: bits.join("；"),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export const generateChartTool: ToolDefinition = {
  name: "generate_chart",
  description:
    "生成期刊级图表并写入项目图表库。两种用法：①多面板复合图（期刊主图，推荐）——传 panelsJson=[{chartType,csv,xLabel,yLabel},...]（2~6 个面板），自动拼成 a/b/c 网格图；"
    + "②单图——先 list_plot_sources 再 generate_chart(chartIndex=N) 或 chartIndices=[0,1,2]（最多 6），也可 csvData+chartType。"
    + "期刊出图要点：①误差棒——数据列加 _sd/_se/_ci 后缀（如「产量,产量_sd」）自动渲染；"
    + "②轴标签带单位——务必传 x_label/y_label（如 y_label=\"产量 (kg/ha)\"）；"
    + "③多系列对比——多列数据即可，图例自动出现；④选型——对比/分组→bar_grouped，趋势→line，占比→pie，热区→heatmap，森林图→forest（四列：研究,估计值,CI下限,CI上限）；"
    + "⑤显著性——bar_grouped 对比显著时传 configJson={\"significance\":[{\"category\":0,\"series\":0,\"value\":\"**\",\"label\":\"p<0.01\"},{\"fromCategory\":0,\"toCategory\":1,\"value\":\"*\"}]}（单柱星号/跨类括号；series 缺省=该类最高柱）。"
    + "改图务必传 replaceImageUrl（旧图 URL）就地替换，勿再追加一张。"
    + "无数据不要编造数值",
  parameters: {
    type: "object",
    properties: {
      replaceImageUrl: {
        type: "string",
        description: "改图：旧图 /api/charts/...png；就地替换正文并删除旧资产（单图/复合图）",
      },
      replaceChartId: {
        type: "string",
        description: "改图：旧图表资产 id（与 replaceImageUrl 二选一）",
      },
      panelsJson: {
        type: "string",
        description:
          "多面板复合图（推荐）：JSON 数组，每项 {chartType, csv, title?, xLabel?, yLabel?}，2~6 个面板，自动拼成 a/b/c 期刊网格图。"
          + "例：\"[{\\\"chartType\\\":\\\"bar_grouped\\\",\\\"csv\\\":\\\"处理,产量,产量_sd\\\\n对照,12,1\\\\n处理A,15,0.9\\\",\\\"xLabel\\\":\\\"处理\\\",\\\"yLabel\\\":\\\"产量\\\"}]\"",
      },
      chartIndex: {
        type: "number",
        description: "list_plot_sources 返回的单个候选 index",
      },
      chartIndices: {
        type: "string",
        description:
          "批量：JSON 数组字符串，如 \"[0,1,2]\"（与 chartIndex 二选一；优先 indices）",
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
      title: { type: "string", description: "图表标题（可覆盖推荐配置；批量时忽略）" },
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
        description:
          "可选：额外 config 字段 JSON 对象字符串。bar_grouped 可传 significance 数组标注显著性，"
          + "如 {\"significance\":[{\"category\":0,\"value\":\"**\"},{\"fromCategory\":0,\"toCategory\":1,\"value\":\"*\"}]}",
      },
      preset: {
        type: "string",
        description: "期刊样式预设：nature（通用/Nature 风，单栏 89mm）| agr_journal（农业期刊双栏 170mm，9pt）| print_bw（黑白打印）",
        enum: ["nature", "agr_journal", "print_bw"],
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

    // P0 防叠图：同 caption/section 已有图 → 自动填 replace
    const existingCharts = await listAgentCharts(ctx.projectId);
    const anti = resolveReplaceForAntiStack({
      params: {
        ...params,
        title: params.title ?? params.caption,
        caption: params.caption ?? params.title,
        sectionKey: sectionKey ?? sectionKeyRaw,
      },
      charts: existingCharts,
    });
    const replaceImageUrl =
      String(anti.params.replaceImageUrl ?? "").trim() || undefined;
    const replaceChartId =
      String(anti.params.replaceChartId ?? "").trim() || undefined;
    const autoReplaced = anti.autoReplaced;

    // —— 多面板复合图：panelsJson（2~6 个面板拼成 a/b/c 期刊网格图）——
    if (params.panelsJson != null && String(params.panelsJson).trim()) {
      const parsedPanels = parsePanelsJson(params.panelsJson);
      if ("error" in parsedPanels) {
        return { success: false, error: parsedPanels.error };
      }
      const title = String(params.title ?? "").trim() || "复合图";
      const caption = String(params.caption ?? "").trim() || title;
      const preset = parsePresetParam(params.preset);
      try {
        const generated = await runPanelGeneration({
          title,
          preset,
          panels: parsedPanels.panels,
        });
        let insertMode: "replaced" | "appended" | undefined;
        let insertedSection: string | undefined;
        if (sectionKey) {
          const ins = await insertOrReplaceAgentSectionImage(
            ctx.userId,
            ctx.projectId!,
            {
              sectionKey,
              caption,
              imageUrl: generated.imageUrl,
              replaceImageUrl,
              replaceChartId,
            },
          );
          insertMode = ins.mode;
          insertedSection = sectionKey;
        } else if (replaceImageUrl || replaceChartId) {
          try {
            await removeAgentChart(ctx.userId, ctx.projectId!, {
              chartId: replaceChartId,
              imageUrl: replaceImageUrl,
              stripFromBody: true,
            });
          } catch {
            /* ignore */
          }
        }
        let persisted: ProjectChartAsset | null = null;
        if (persistToProject) {
          persisted = await persistAgentChart(ctx.userId, ctx.projectId!, {
            figureId: "panel_multi",
            caption,
            imageUrl: generated.imageUrl,
            sectionKey: sectionKey ?? undefined,
          });
        }
        const bits = [
          `已生成 ${parsedPanels.panels.length} 面板复合图「${title}」`,
        ];
        if (persisted) bits.push("已登记到项目图表库");
        if (insertMode === "replaced" || autoReplaced) {
          bits.push(`已就地替换旧图（防叠图${autoReplaced ? "·自动" : ""}）`);
        } else if (insertedSection) {
          bits.push(`已插入章节 ${insertedSection}`);
        }
        return {
          success: true,
          data: {
            imageUrl: generated.imageUrl,
            panelCount: generated.panelCount,
            persisted,
            insertedSection,
            insertMode: insertMode ?? (autoReplaced ? "replaced" : undefined),
            figureId: "panel_multi",
          },
          summary: bits.join("；"),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
      }
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

    const indices = parseChartIndices(params);
    if (indices.length > MAX_BATCH_CHARTS) {
      return {
        success: false,
        error: `一次最多生成 ${MAX_BATCH_CHARTS} 张图，请拆分 chartIndices`,
      };
    }

    // —— 批量：按 list_plot_sources 候选出多图 ——
    if (indices.length >= 1) {
      const bundle = await loadAgentPlotSources(ctx.userId, ctx.projectId);
      if (!bundle) {
        return { success: false, error: "项目不存在或无权访问" };
      }

      const results: Array<Record<string, unknown>> = [];
      const errors: string[] = [];
      for (const idx of indices) {
        const one = await generateFromBundle({
          ctx,
          bundle,
          chartIndex: idx,
          titleOverride: indices.length === 1 ? String(params.title ?? "").trim() : "",
          xLabelOverride: String(params.xLabel ?? "").trim(),
          yLabelOverride: String(params.yLabel ?? "").trim(),
          captionOverride: String(params.caption ?? "").trim(),
          sectionKey: sectionKey ?? undefined,
          persistToProject,
          preset: parsePresetParam(params.preset),
          extras,
          // 批量多图时不套用 replace（避免把同一旧图换掉多次）
          replaceImageUrl: indices.length === 1 ? replaceImageUrl : undefined,
          replaceChartId: indices.length === 1 ? replaceChartId : undefined,
        });
        if (!one.success) {
          errors.push(`[${idx}] ${one.error ?? "失败"}`);
          continue;
        }
        if (one.data) results.push(one.data);
      }

      if (results.length === 0) {
        return {
          success: false,
          error: errors.join("；") || "批量出图失败",
        };
      }

      return {
        success: true,
        data: {
          count: results.length,
          charts: results,
          errors: errors.length ? errors : undefined,
        },
        summary:
          `已生成 ${results.length} 张图`
          + (errors.length ? `（${errors.length} 张失败）` : ""),
      };
    }

    // —— 单次：手写 csvData ——
    return generateOneChart({
      ctx,
      csvData: String(params.csvData ?? "").trim(),
      chartType: String(params.chartType ?? "").trim(),
      title: String(params.title ?? "").trim(),
      xLabel: String(params.xLabel ?? "").trim(),
      yLabel: String(params.yLabel ?? "").trim(),
      caption: String(params.caption ?? "").trim(),
      sectionKey: sectionKey ?? undefined,
      persistToProject,
      preset: parsePresetParam(params.preset),
      extras,
      replaceImageUrl,
      replaceChartId,
    });
  },
};

async function generateFromBundle(input: {
  ctx: AgentContext;
  bundle: AgentPlotSourcesBundle;
  chartIndex: number;
  titleOverride: string;
  xLabelOverride: string;
  yLabelOverride: string;
  captionOverride: string;
  sectionKey?: string;
  persistToProject: boolean;
  preset?: "nature" | "agr_journal" | "print_bw";
  extras: Record<string, unknown>;
  replaceImageUrl?: string;
  replaceChartId?: string;
}) {
  const resolved = resolvePlotCandidate(input.bundle, input.chartIndex);
  if ("error" in resolved) {
    return { success: false as const, error: resolved.error };
  }
  return generateOneChart({
    ctx: input.ctx,
    csvData: resolved.csv,
    chartType: resolved.figureId,
    title: input.titleOverride || resolved.cfg.title,
    xLabel: input.xLabelOverride || resolved.cfg.xLabel || "",
    yLabel: input.yLabelOverride || resolved.cfg.yLabel || "",
    caption: input.captionOverride || input.titleOverride || resolved.cfg.title,
    sectionKey: input.sectionKey,
    persistToProject: input.persistToProject,
    preset: input.preset,
    extras: input.extras,
    chartIndex: input.chartIndex,
    replaceImageUrl: input.replaceImageUrl,
    replaceChartId: input.replaceChartId,
  });
}

/** 校验期刊预设参数，非法回退 nature */
function parsePresetParam(
  raw: unknown,
): "nature" | "agr_journal" | "print_bw" {
  const v = String(raw ?? "").trim();
  return v === "agr_journal" || v === "print_bw" ? v : "nature";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
