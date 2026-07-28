import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import { formatLabScopeBlock } from "@/lib/agent/lab-scope";

const PHASE_LABELS: Record<number, string> = {
  0: "配置",
  1: "文献",
  2: "架构",
  3: "论证",
  4: "起草",
  5: "引用",
  6: "摘要",
  7: "审查",
};

const OUTLINE_BRIEF_CHARS = 3500;
const REF_BRIEF_COUNT = 12;
const REF_LINE_CHARS = 160;

/** 压缩项目快照为 Agent 系统提示中的「当前项目」简报（尽量多上下文） */
export function formatAgentProjectBriefing(
  project: AgentProjectSnapshot | null | undefined,
  options?: { knowledgeCategories?: readonly string[] },
): string {
  const scopeBlock = formatLabScopeBlock(options?.knowledgeCategories);

  if (!project) {
    return (
      `${scopeBlock}\n\n`
      + "当前未绑定论文项目。请先让用户打开项目；无 projectId 时不要调用 write_section。"
    );
  }

  const outlinePreview = project.outline.trim()
    ? project.outline.trim().slice(0, OUTLINE_BRIEF_CHARS)
      + (project.outline.length > OUTLINE_BRIEF_CHARS ? "…" : "")
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

  const refLines = project.references.slice(0, REF_BRIEF_COUNT).map((r, i) => {
    const line = r.replace(/\s+/g, " ").trim().slice(0, REF_LINE_CHARS);
    return `[${i + 1}] ${line}${r.length > REF_LINE_CHARS ? "…" : ""}`;
  });

  const sectionPreviews = project.sectionFills
    .filter((s) => s.preview && s.chars > 0)
    .slice(0, 6)
    .map((s) => `### ${s.key}（${s.chars}字）\n${s.preview}`)
    .join("\n\n");

  const lines = [
    `标题：${project.title}`,
    `类型：${project.mode === "research" ? "研究型" : "综述"}；语言：${project.language}；引用：${project.citationStyle}`,
    `研究方向：${project.researchDirection || "（未填）"}`,
    `Passport 当前阶段：${phase}（对齐 academic-paper Phase ${project.currentPhase ?? "?"}）`,
    `PaperConfig：${project.hasPaperConfig ? "已填写" : "未填写（可用 update_paper_config）"}`,
    `文献条数：${project.references.length}`,
    `证据声明：${project.dataClaims.length} 条`,
    `写作蓝图：${project.hasWritingBlueprint ? "有" : "无"}${
      project.writingBlueprintSummary ? ` — ${project.writingBlueprintSummary}` : ""
    }`,
    `论证蓝图：${project.hasArgumentBlueprint ? "有" : "无"}${
      project.argumentBlueprintSummary ? ` — ${project.argumentBlueprintSummary}` : ""
    }`,
    `已有正文：${filled || "无"}`,
    `空白章节：${empty || "无"}`,
    `大纲全文：\n${outlinePreview}`,
  ];

  if (project.dataClaims.length > 0) {
    const claimLines = project.dataClaims.slice(0, 8).map((c) => `- ${c.id}: ${c.text.slice(0, 120)}`);
    lines.push(`证据声明样例：\n${claimLines.join("\n")}`);
  }

  if (refLines.length > 0) {
    lines.push(`参考文献（前 ${refLines.length} 条）：\n${refLines.join("\n")}`);
  }
  if (sectionPreviews) {
    lines.push(`章节摘录：\n${sectionPreviews}`);
  }

  return `${scopeBlock}\n\n${lines.join("\n")}`;
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
    tips.push("按 academic-paper 生成大纲与写作蓝图并写回项目");
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
  if (writeEnabled && (currentPhase ?? 0) >= 4) {
    tips.push("按 academic-paper 流程继续：起草→引用检查→双语摘要→审查");
  }
  if (writeEnabled) {
    tips.push("查看可配图数据并生成图表");
  }

  return tips.slice(0, 4);
}
