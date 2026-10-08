import { assessDataFoundation } from "@/lib/agent/data-foundation";
import { formatEntryRouteBrief } from "@/lib/agent/entry-route";
import { suggestVenueProfile } from "@/lib/venues/registry";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import { formatLabScopeBlock } from "@/lib/agent/lab-scope";
import {
  evaluateDraftCoverage,
  sectionCharsFromFills,
} from "@/lib/draft-coverage";
import { manuscriptSubsectionTitle } from "@/lib/writing-merge";

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
  options?: { knowledgeCategories?: readonly string[]; directionSlug?: string },
): string {
  const scopeBlock = formatLabScopeBlock({
    knowledgeCategories: options?.knowledgeCategories,
    title: project?.title,
    researchDirection: project?.researchDirection,
    directionSlug: options?.directionSlug,
  });

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

  const coverage = evaluateDraftCoverage({
    mode: project.mode,
    language: project.language,
    sectionChars: sectionCharsFromFills(project.sectionFills),
  });

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
    `目标字数：${project.paperConfig?.wordCount?.trim() || "（未填）"}`,
    `目标期刊：${project.paperConfig?.targetJournal?.trim() || "（未定刊）"}`,
    ...(() => {
      const journal = project.paperConfig?.targetJournal?.trim() ?? "";
      const suggestion = suggestVenueProfile(journal);
      if (!suggestion) return [];
      const template = project.template || "sci";
      if (suggestion.language === project.language && suggestion.template === template) return [];
      const languageLabel = suggestion.language === "en" ? "英文" : "中文";
      return [
        `刊名与规格不一致：按「${journal}」应为${languageLabel}、模板 ${suggestion.template}，当前是${project.language === "en" ? "英文" : "中文"}、模板 ${template}。不要自行改配置，等用户在项目设置里确认。`,
      ];
    })(),
    `写作入口：${
      project.agentEntryMode === "outline_ready"
        ? "已有大纲（勿主动 generate_outline）"
        : project.agentEntryMode === "data_ready"
          ? "已有数据（先 list_plot_sources / 结果方法）"
          : project.agentEntryMode === "full"
            ? "从零推进（配置→文献→大纲→分节写）"
            : "未选定（新建项目时可设；或 update_paper_config）"
    }`,
    ...(() => {
      const route = formatEntryRouteBrief(
        project.agentEntryMode,
        project.mode === "research" ? "research" : "review",
        project.template,
      );
      return route ? [route] : [];
    })(),
    `文献条数：${project.references.length}`,
    assessDataFoundation({
      claimCount: project.dataClaims.length,
      sourceCount: 0,
      candidateCount: 0,
    }).brief,
    `证据声明：${project.dataClaims.length} 条`
    + (project.dataClaims.length === 0
      ? "。写 results 前须 ingest 表格：对话框上传 CSV/Excel，或粘贴 csvData。无声明则研究型结果章会被拒绝。"
      : ""),
    `写作蓝图：${project.hasWritingBlueprint ? "有" : "无"}${
      project.writingBlueprintSummary ? ` — ${project.writingBlueprintSummary}` : ""
    }`,
    ...(project.blueprintWritingOrder?.length
      ? [
          `建议写作顺序（蓝图）：${project.blueprintWritingOrder
            .map((p, i) => `${i + 1}. ${p}`)
            .join(" → ")}`,
        ]
      : []),
    ...(project.blueprintSectionGuides?.length
      ? [
          `各节写作要点（蓝图；write_section 须对齐，系统会自动注入本节蓝图）：\n${project.blueprintSectionGuides
            .map((g) => {
              const kp =
                g.keyPoints?.length
                  ? `；要点：${g.keyPoints.join("；")}`
                  : "";
              return `- ${g.path}：${g.purpose}${kp}`;
            })
            .join("\n")}`,
        ]
      : []),
    ...(project.blueprintFigurePlanSummary
      ? [`蓝图配图计划：${project.blueprintFigurePlanSummary}`]
      : []),
    `论证规划：已并入写作蓝图各节（claim / evidenceHint / warrant）；勿再单独生成论证蓝图${
      project.argumentBlueprintSummary
        ? `（项目中仍有旧版独立论证蓝图摘要，仅供参考：${project.argumentBlueprintSummary}）`
        : ""
    }`,
    `已有正文：${filled || "无"}`,
    ...(project.nextWriteHint
      ? [
          `下一未写子节：立刻 write_section(section=${project.nextWriteHint.sectionKey}, subsectionTitle="${manuscriptSubsectionTitle(project.nextWriteHint.subsectionPath)}")；用户说「继续」时禁止再 list_references / read_section / 检索。正文禁止粘贴「父节 > 子节」路径。`,
        ]
      : []),
    `空白章节：${empty || "无"}`,
    `分节完整度：必写 ${coverage.okRequiredCount}/${coverage.requiredCount}；${coverage.hint}`,
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

export type { SuggestNextAgentActionsInput } from "@/lib/agent/core/agent-phase";
export { suggestNextAgentActions } from "@/lib/agent/core/agent-phase";
