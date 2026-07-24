import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";

const PHASE_LABELS: Record<number, string> = {
  0: "配置",
  1: "文献",
  2: "结构",
  3: "论证",
  4: "起草",
  5: "引用+摘要",
  6: "审查",
  7: "导出",
};

/** 压缩项目快照为 Agent 系统提示中的「当前项目」简报 */
export function formatAgentProjectBriefing(
  project: AgentProjectSnapshot | null | undefined,
): string {
  if (!project) {
    return "当前未绑定论文项目。请先让用户打开项目；无 projectId 时不要调用 write_section。";
  }

  const outlinePreview = project.outline.trim()
    ? project.outline.trim().slice(0, 800) + (project.outline.length > 800 ? "…" : "")
    : "（尚无大纲）";

  const filled = project.sectionFills
    .filter((s) => s.chars > 0)
    .map((s) => `${s.key}:${s.chars}字`)
    .join(", ");
  const empty = project.sectionFills
    .filter((s) => s.chars === 0)
    .map((s) => s.key)
    .join(", ");

  const phase =
    project.currentPhase != null
      ? `${project.currentPhase}（${PHASE_LABELS[project.currentPhase] ?? "?"}）`
      : "未知";

  const lines = [
    `标题：${project.title}`,
    `类型：${project.mode === "research" ? "研究型" : "综述"}；语言：${project.language}；引用：${project.citationStyle}`,
    `研究方向：${project.researchDirection || "（未填）"}`,
    `Passport 当前阶段：${phase}`,
    `文献条数：${project.references.length}`,
    `写作蓝图：${project.hasWritingBlueprint ? "有" : "无"}；论证蓝图：${project.hasArgumentBlueprint ? "有" : "无"}`,
    `已有正文：${filled || "无"}`,
    `空白章节：${empty || "无"}`,
    `大纲摘要：\n${outlinePreview}`,
  ];

  return lines.join("\n");
}

/** 根据 Passport 阶段给出下一步建议（前端快捷语 / 规划器共用） */
export function suggestNextAgentActions(input: {
  currentPhase?: number | null;
  writeEnabled: boolean;
  hasOutline: boolean;
  hasArgumentBlueprint: boolean;
  emptySections: string[];
}): string[] {
  const { currentPhase, writeEnabled, hasOutline, hasArgumentBlueprint, emptySections } = input;
  const tips: string[] = [];

  if ((currentPhase ?? 1) <= 1) {
    tips.push("检索相关文献并总结研究缺口");
  }
  if (!hasOutline && (currentPhase ?? 2) <= 2) {
    tips.push("根据题目帮我规划大纲要点（不直接写正文）");
  }
  if (hasOutline && !hasArgumentBlueprint && writeEnabled) {
    tips.push("基于大纲生成论证蓝图并写回项目");
  }
  if (writeEnabled && emptySections.includes("introduction")) {
    tips.push("写引言并保存到当前项目");
  } else if (writeEnabled && emptySections[0] && emptySections[0] !== "abstract") {
    const key = emptySections[0];
    const label =
      key === "methods"
        ? "方法"
        : key === "results"
          ? "结果"
          : key === "discussion"
            ? "讨论"
            : key === "conclusion"
              ? "结论"
              : key === "literature_body"
                ? "综述正文"
                : key;
    tips.push(`写${label}并保存到当前项目`);
  }
  if (writeEnabled && !emptySections.includes("introduction") && emptySections.includes("abstract")) {
    tips.push("基于正文生成中英双语摘要并写回");
  }
  if (writeEnabled) {
    tips.push("检查当前项目引用编号是否越界");
  } else {
    tips.push("分析这个方向有什么可写的");
  }

  return [...new Set(tips)].slice(0, 4);
}
