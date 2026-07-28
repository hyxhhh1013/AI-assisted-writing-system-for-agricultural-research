import { loadAgentProject } from "@/lib/agent/project-loader";
import { formatAgentProjectBriefing } from "@/lib/agent/project-briefing";
import { resolvePhaseTaskPack } from "@/lib/agent/phase-task-pack";
import { loadAgentPlotSources } from "@/lib/agent/plot-sources";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

/**
 * 智能体自取项目上下文（对齐通用 Agent：先看清再动手）。
 */
export const inspectProjectTool: ToolDefinition = {
  name: "inspect_project",
  description:
    "读取当前论文项目的最新状态：阶段、配置、大纲/蓝图有无、各章节字数、文献数、证据声明、可配图候选、空白章节与建议下一步。写之前或不知道卡在哪时先调用",
  parameters: {
    type: "object",
    properties: {
      includeBriefing: {
        type: "string",
        description: "是否附带完整项目简报文本（默认 true）",
      },
    },
    required: [],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "inspect_project 需要绑定 projectId" };
    }
    const project = await loadAgentProject(ctx.userId, ctx.projectId);
    if (!project) {
      return { success: false, error: "项目不存在或无权访问" };
    }

    ctx.projectSnapshot = project;
    const briefing = formatAgentProjectBriefing(project);
    ctx.projectBriefing = briefing;

    const pack = resolvePhaseTaskPack(project);
    const empty = project.sectionFills.filter((s) => s.chars === 0).map((s) => s.key);
    const filled = project.sectionFills
      .filter((s) => s.chars > 0)
      .map((s) => `${s.key}:${s.chars}`);

    const plot = await loadAgentPlotSources(ctx.userId, ctx.projectId);
    const claimCount = project.dataClaims.length;
    const plotCandidates = plot?.candidates.length ?? 0;
    const existingCharts = plot?.existingChartCount ?? 0;

    const includeBriefing =
      params.includeBriefing === undefined
      || params.includeBriefing === true
      || params.includeBriefing === "true"
      || params.includeBriefing === "1";

    return {
      success: true,
      data: {
        title: project.title,
        mode: project.mode,
        phase: project.currentPhase,
        phaseTitle: pack.pack.title,
        suggestedGoal: pack.goal,
        hasPaperConfig: project.hasPaperConfig,
        hasOutline: project.outline.trim().length >= 20,
        hasWritingBlueprint: project.hasWritingBlueprint,
        hasArgumentBlueprint: project.hasArgumentBlueprint,
        referenceCount: project.references.length,
        claimCount,
        plotCandidates,
        existingCharts,
        filledSections: filled,
        emptySections: empty,
        preferredTools: pack.pack.preferredTools,
        constraints: pack.pack.constraints,
        skillHint: `academic-paper Phase ${pack.pack.phase}（${pack.pack.title}）→ 推荐 ${pack.pack.preferredTools.join(" → ") || "对话确认配置"}`,
        ...(includeBriefing ? { briefing } : {}),
      },
      summary: `项目「${project.title}」阶段 ${project.currentPhase ?? "?"}（${pack.pack.title}）；空白节 ${empty.length}；文献 ${project.references.length}；证据 ${claimCount}；可配图 ${plotCandidates}。建议：${pack.goal}`,
    };
  },
};
