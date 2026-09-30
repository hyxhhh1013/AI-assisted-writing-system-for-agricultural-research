import { assessDataFoundation } from "@/lib/agent/data-foundation";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import { formatLabScopeBlock } from "@/lib/agent/lab-scope";
import {
  evaluateDraftCoverage,
  sectionCharsFromFills,
} from "@/lib/draft-coverage";

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

function sectionLabel(key: string): string {
  const map: Record<string, string> = {
    abstract: "摘要",
    introduction: "引言",
    background: "研究现状",
    literature_body: "综述正文",
    methods: "方法",
    results: "结果",
    discussion: "讨论",
    conclusion: "结论",
  };
  return map[key] ?? key;
}

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
    `写作入口：${
      project.agentEntryMode === "outline_ready"
        ? "已有大纲（勿主动 generate_outline）"
        : project.agentEntryMode === "data_ready"
          ? "已有数据（先 list_plot_sources / 结果方法）"
          : project.agentEntryMode === "full"
            ? "从零推进（配置→文献→大纲→分节写）"
            : "未选定（新建项目时可设；或 update_paper_config）"
    }`,
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

export interface SuggestNextAgentActionsInput {
  currentPhase?: number | null;
  writeEnabled: boolean;
  hasOutline: boolean;
  /** @deprecated 论证已并入写作蓝图；保留字段以免旧调用方崩 */
  hasArgumentBlueprint?: boolean;
  hasWritingBlueprint?: boolean;
  emptySections: string[];
  /** 优先于 emptySections 的薄节/缺口 */
  nextSectionKey?: string | null;
  thinOrGapSections?: string[];
}

function writeTargetOf(input: SuggestNextAgentActionsInput): string | null {
  return (
    input.nextSectionKey
    || input.thinOrGapSections?.[0]
    || (input.emptySections.includes("introduction")
      ? "introduction"
      : input.emptySections.find((k) => k !== "abstract"))
    || null
  );
}

function writeSectionTip(input: SuggestNextAgentActionsInput, target: string): string {
  const thinHint =
    input.thinOrGapSections?.includes(target)
    && !input.emptySections.includes(target)
      ? "（当前偏薄，建议扩写/补强）"
      : "";
  return `写${sectionLabel(target)}并保存到当前项目${thinHint}`;
}

/**
 * 当前唯一的「下一步」主建议（前端芯片 / 续跑条 / 阶段包 goal / inspect 共用）。
 * 按阶段互斥，禁止同时抛「检索文献」和「写引言」。
 */
export function suggestNextAgentActions(input: SuggestNextAgentActionsInput): string[] {
  const phase = input.currentPhase;
  const hasOutline = input.hasOutline;
  const writeEnabled = input.writeEnabled;
  const writeTarget = writeTargetOf(input);

  if ((phase ?? 0) >= 7) {
    return ["运行下一轮论文审查"];
  }
  if ((phase ?? 0) >= 6) {
    return ["基于已写正文生成中英双语摘要并写回项目"];
  }
  if ((phase ?? 0) >= 5) {
    return ["检查当前引用"];
  }

  if ((phase ?? 1) <= 1 && !hasOutline) {
    return ["检索相关文献并总结研究缺口"];
  }
  if (!hasOutline) {
    return ["生成大纲与写作蓝图并写回项目"];
  }
  if (!input.hasWritingBlueprint) {
    return ["基于大纲生成写作蓝图（含各节主张/证据）并写回项目"];
  }
  if (writeEnabled && writeTarget) {
    return [writeSectionTip(input, writeTarget)];
  }
  if (writeEnabled) {
    return ["查看可配图数据并生成图表"];
  }
  return [];
}
