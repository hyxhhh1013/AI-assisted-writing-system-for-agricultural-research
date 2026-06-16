import type {
  FigurePlanItem,
  SectionGuide,
  WritingBlueprint,
} from "@/contracts/writing-blueprint";

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

/** 注入扩写上下文的蓝图片段（仅当前节相关） */
export function formatBlueprintSectionHint(
  blueprint: WritingBlueprint,
  sectionFullPath: string,
): string {
  const guide = findSectionGuide(blueprint, sectionFullPath);
  const figures = figuresForSection(sectionFullPath, blueprint.figurePlan.items);

  const parts: string[] = ["【写作蓝图（本节）】"];
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
