import type {
  FigurePlanItem,
  FigurePlanType,
  SectionGuide,
  WritingBlueprint,
} from "@/contracts/writing-blueprint";
import type { ChartConfig, DataSourceAnalysis } from "@/contracts/data-source";
import {
  buildPlotPageHref,
  chartTypeToFigureId,
  collectChartConfigsFromSources,
} from "@/contracts/figure";

/** 大纲文本指纹（大纲变更后用于标记蓝图过期） */
export function computeOutlineHash(outline: string): string {
  const normalized = outline.replace(/\r\n/g, "\n").trim();
  let h = 5381;
  for (let i = 0; i < normalized.length; i++) {
    h = (Math.imul(33, h) ^ normalized.charCodeAt(i)) >>> 0;
  }
  return `oh-${h.toString(36)}`;
}

export function isBlueprintStale(
  blueprint: WritingBlueprint,
  currentOutline: string,
): boolean {
  if (!blueprint.outlineHash) return false;
  return blueprint.outlineHash !== computeOutlineHash(currentOutline);
}

const BLUEPRINT_TYPE_TO_FIGURE: Record<FigurePlanType, string | null> = {
  flow: "flow",
  chart: "bar_grouped",
  xrd: "xrd_bragg",
  table: "table_three_line",
  schematic: "flow",
  other: null,
};

/** 供蓝图生成 Prompt 使用的项目图表目录（index 与 collectChartConfigsFromSources 一致） */
export interface BlueprintChartCatalogEntry {
  index: number;
  title: string;
  sourceFileName: string;
  variable?: string;
}

export function buildBlueprintChartCatalog(
  sources: DataSourceAnalysis[],
): BlueprintChartCatalogEntry[] {
  const configs = collectChartConfigsFromSources(sources);
  return configs.map((cfg, index) => ({
    index,
    title: cfg.title,
    sourceFileName: findChartConfigSourceFile(sources, cfg) ?? "试验数据",
    variable: cfg.yLabel,
  }));
}

function findChartConfigSourceFile(
  sources: DataSourceAnalysis[],
  target: ChartConfig,
): string | null {
  for (const source of sources) {
    if (source.chartConfigs?.some((c) => chartConfigsEqual(c, target))) {
      return source.fileName;
    }
  }
  for (const source of sources) {
    if (source.stats.some((s) => s.variable === target.yLabel)) {
      return source.fileName;
    }
  }
  return sources[0]?.fileName ?? null;
}

function chartConfigsEqual(a: ChartConfig, b: ChartConfig): boolean {
  return a.title === b.title && a.type === b.type && a.yLabel === b.yLabel;
}

/** 为 chart 项解析 chartConfig 全局下标 */
export function resolveChartConfigIndex(
  item: FigurePlanItem,
  chartConfigs: ChartConfig[],
): number | null {
  if (chartConfigs.length === 0) return null;

  const bound = item.dataBinding;
  if (bound?.kind === "chartConfig") {
    const idx = bound.chartConfigIndex;
    if (idx >= 0 && idx < chartConfigs.length) return idx;
  }

  const needle = [
    item.suggestedCaption,
    item.purpose,
    bound?.variable,
    bound?.chartTitle,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (let i = 0; i < chartConfigs.length; i++) {
    const cfg = chartConfigs[i];
    const title = cfg.title.toLowerCase();
    const yLabel = cfg.yLabel?.toLowerCase() ?? "";
    if (bound?.variable && yLabel && yLabel === bound.variable.toLowerCase()) return i;
    if (yLabel && needle.includes(yLabel)) return i;
    if (title && (needle.includes(title) || title.includes(needle.slice(0, 6)))) return i;
  }

  return chartConfigs.length === 1 ? 0 : null;
}

export function enrichBlueprintChartBindings(
  blueprint: WritingBlueprint,
  sources: DataSourceAnalysis[],
): WritingBlueprint {
  const catalog = buildBlueprintChartCatalog(sources);
  return enrichBlueprintChartBindingsFromCatalog(blueprint, catalog);
}

export function enrichBlueprintChartBindingsFromCatalog(
  blueprint: WritingBlueprint,
  catalog: BlueprintChartCatalogEntry[],
): WritingBlueprint {
  if (catalog.length === 0) return blueprint;

  const chartConfigs = catalog.map((entry) => ({
    type: "bar" as const,
    title: entry.title,
    yLabel: entry.variable,
    labels: [] as string[],
    datasets: [{ label: entry.variable ?? "数值", data: [] as number[] }],
  }));

  const items = blueprint.figurePlan.items.map((item) => {
    if (item.type !== "chart") return item;
    const idx = resolveChartConfigIndex(item, chartConfigs);
    if (idx === null) return item;
    const entry = catalog[idx];
    if (!entry) return item;
    return {
      ...item,
      dataBinding: {
        kind: "chartConfig" as const,
        chartConfigIndex: idx,
        sourceFileName: entry.sourceFileName,
        variable: entry.variable,
        chartTitle: entry.title,
      },
    };
  });

  return {
    ...blueprint,
    figurePlan: { ...blueprint.figurePlan, items },
  };
}

export function blueprintFigureDataBindingLabel(item: FigurePlanItem): string | null {
  const b = item.dataBinding;
  if (b?.kind !== "chartConfig") return null;
  const parts = [b.chartTitle, b.variable, b.sourceFileName].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : `推荐图表 #${b.chartConfigIndex + 1}`;
}

/** 蓝图配图项 → /plot 深链（chart 类优先 chartIdx 载入项目试验数据） */
export function blueprintFigureToPlotHref(
  projectId: string,
  item: FigurePlanItem,
  chartConfigs: ChartConfig[] = [],
): string | null {
  const figureId = BLUEPRINT_TYPE_TO_FIGURE[item.type];
  if (!figureId) return null;

  if (item.type === "flow" || item.type === "schematic") {
    return buildPlotPageHref({
      projectId,
      figureId: "flow",
      figureSpec: {
        tool: "flow",
        config: { title: item.suggestedCaption },
        caption: item.suggestedCaption,
      },
    });
  }

  if (item.type === "chart") {
    const idx = resolveChartConfigIndex(item, chartConfigs);
    if (idx !== null) {
      const cfg = chartConfigs[idx];
      return buildPlotPageHref({
        projectId,
        figureId: chartTypeToFigureId(cfg.type),
        chartIdx: idx,
      });
    }
    return buildPlotPageHref({
      projectId,
      figureId,
      figureSpec: {
        tool: "chart",
        config: {
          type: "bar",
          title: item.suggestedCaption,
          data: {
            labels: ["组1", "组2", "组3"],
            datasets: [{ label: "数值", data: [0, 0, 0] }],
          },
        },
        caption: item.suggestedCaption,
      },
    });
  }

  return buildPlotPageHref({ projectId, figureId });
}

/** 配图是否归属该大纲节点（自身或子节） */
export function figureBelongsToSection(itemPath: string, taskPath: string): boolean {
  const item = itemPath.trim();
  const task = taskPath.trim();
  if (!item || !task) return false;
  return item === task || item.startsWith(`${task} > `);
}

/** 统计某大纲节点下的规划配图数量 */
export function countFiguresForSection(taskPath: string, items: FigurePlanItem[]): number {
  return items.filter((item) => figureBelongsToSection(item.sectionPath, taskPath)).length;
}

/** 获取某节点的直接配图项（不含更深子节时可单独用） */
export function figuresForSection(taskPath: string, items: FigurePlanItem[]): FigurePlanItem[] {
  return items.filter((item) => figureBelongsToSection(item.sectionPath, taskPath));
}

export function findSectionGuide(
  blueprint: WritingBlueprint,
  sectionPath: string,
): SectionGuide | undefined {
  return blueprint.sectionGuides.find(
    (g) => g.sectionPath === sectionPath || sectionPath.startsWith(`${g.sectionPath} > `),
  );
}

const BLUEPRINT_SECTION_HINT_HEAD = "【写作蓝图（本节）】";

/** 去掉扩写上下文中旧的「本节蓝图」块（保存后重注入前用） */
export function stripBlueprintSectionHint(context: string): string {
  const marker = `\n${BLUEPRINT_SECTION_HINT_HEAD}`;
  const idx = context.indexOf(marker);
  if (idx === -1) {
    if (context.startsWith(BLUEPRINT_SECTION_HINT_HEAD)) return "";
    return context.trimEnd();
  }
  return context.slice(0, idx).trimEnd();
}

/** 用已保存蓝图刷新扩写上下文中的本节提示（发起扩写时调用） */
export function applyBlueprintSectionHintToContext(
  context: string,
  blueprint: WritingBlueprint | null | undefined,
  sectionFullPath: string,
): string {
  const base = stripBlueprintSectionHint(context);
  if (!blueprint || !sectionFullPath.trim()) return base;
  const hint = formatBlueprintSectionHint(blueprint, sectionFullPath);
  if (!hint.trim()) return base;
  return base ? `${base}\n${hint}` : hint.trimEnd();
}

/** 注入扩写上下文的蓝图片段（仅当前节相关） */
export function formatBlueprintSectionHint(
  blueprint: WritingBlueprint,
  sectionFullPath: string,
): string {
  const guide = findSectionGuide(blueprint, sectionFullPath);
  const figures = figuresForSection(sectionFullPath, blueprint.figurePlan.items);

  const parts: string[] = [BLUEPRINT_SECTION_HINT_HEAD];
  if (guide) {
    parts.push(`- 本节目的：${guide.purpose}`);
    if (guide.keyPoints.length > 0) {
      parts.push(`- 要点：${guide.keyPoints.join("；")}`);
    }
  }
  if (figures.length > 0) {
    parts.push("- 规划配图：");
    for (const fig of figures) {
      const req = fig.priority === "required" ? "必需" : "可选";
      parts.push(
        `  · [${fig.type}] ${fig.suggestedCaption}（${req}）— ${fig.purpose}`,
      );
    }
  }
  if (parts.length === 1) return "";
  return `${parts.join("\n")}\n`;
}

/** 注入 Writer 全局背景 */
export function formatBlueprintGlobalSummary(blueprint: WritingBlueprint): string {
  const { min, max } = blueprint.estimatedWordCount;
  const fig = blueprint.figurePlan;
  const lines = [
    "- 核心论点：" + blueprint.thesis,
    "- 叙事脉络：" + blueprint.narrativeSummary.slice(0, 400),
    `- 预计篇幅：${min}–${max} 字；配图 ${fig.totalMin}–${fig.totalMax} 张（已规划 ${fig.items.length} 项）`,
  ];
  if (blueprint.prerequisites.length > 0) {
    lines.push("- 前置条件：" + blueprint.prerequisites.slice(0, 5).join("；"));
  }
  return lines.join("\n");
}

const FIGURE_TYPE_LABELS: Record<string, string> = {
  flow: "流程图",
  chart: "数据图",
  xrd: "XRD",
  table: "表格",
  schematic: "示意图",
  other: "其他",
};

export function figureTypeLabel(type: string): string {
  return FIGURE_TYPE_LABELS[type] ?? type;
}

/** 保存前同步 figurePlan 总量区间 */
export function normalizeBlueprintDraft(blueprint: WritingBlueprint): WritingBlueprint {
  const items = blueprint.figurePlan.items;
  const required = items.filter((i) => i.priority === "required").length;
  const optional = items.filter((i) => i.priority === "optional").length;
  const totalMin = Math.max(required, 0);
  const totalMax = Math.max(totalMin, required + optional);
  return {
    ...blueprint,
    figurePlan: {
      ...blueprint.figurePlan,
      totalMin,
      totalMax,
    },
  };
}
