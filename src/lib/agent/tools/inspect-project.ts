import { formatAgentProjectBriefing } from "@/lib/agent/project-briefing";
import { getAgentProjectSnapshot } from "@/lib/agent/project-refresh";
import { resolvePhaseTaskPack } from "@/lib/agent/phase-task-pack";
import { loadAgentPlotSources } from "@/lib/agent/plot-sources";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import {
  evaluateCitationGrounding,
  refsFromLiteRows,
} from "@/lib/citation-grounding";
import {
  evaluateDraftCoverage,
  sectionCharsFromFills,
} from "@/lib/draft-coverage";
import prisma from "@/lib/prisma";
import { findReferenceRowsLite } from "@/lib/reference-rows";

/**
 * 智能体自取项目上下文（对齐通用 Agent：先看清再动手）。
 */
export const inspectProjectTool: ToolDefinition = {
  name: "inspect_project",
  description:
    "读取当前论文项目的最新状态：阶段、配置、大纲/蓝图、各章节字数与薄节/缺口、文献、证据、配图候选、引用语义告警与建议下一步。写之前或不知道卡在哪时先调用",
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
    const project = await getAgentProjectSnapshot(ctx);
    if (!project) {
      return { success: false, error: "项目不存在或无权访问" };
    }

    const briefing = formatAgentProjectBriefing(project);
    ctx.projectBriefing = briefing;

    const pack = resolvePhaseTaskPack(project);
    const empty = project.sectionFills.filter((s) => s.chars === 0).map((s) => s.key);
    const filled = project.sectionFills
      .filter((s) => s.chars > 0)
      .map((s) => `${s.key}:${s.chars}`);

    const draftCoverage = evaluateDraftCoverage({
      mode: project.mode,
      language: project.language,
      sectionChars: sectionCharsFromFills(project.sectionFills),
    });

    const plot = await loadAgentPlotSources(ctx.userId, ctx.projectId);
    const claimCount = project.dataClaims.length;
    const plotCandidates = plot?.candidates.length ?? 0;
    const existingCharts = plot?.existingChartCount ?? 0;

    let citationGrounding: {
      suspiciousCount: number;
      softUnusedCount: number;
      softGroundableCount: number;
      softUnusedRatio: number | null;
      hint: string;
    } | null = null;

    try {
      const rows = await findReferenceRowsLite(ctx.projectId, ctx.userId);
      const sections = await prisma.section.findMany({
        where: { projectId: ctx.projectId },
        select: { content: true },
      });
      const draftText = sections.map((s) => s.content).join("\n\n");
      const report = evaluateCitationGrounding({
        draftText,
        references: refsFromLiteRows(rows),
      });
      citationGrounding = {
        suspiciousCount: report.suspiciousCount,
        softUnusedCount: report.softPool.softUnusedCount,
        softGroundableCount: report.softPool.softGroundableCount,
        softUnusedRatio: report.softPool.unusedRatio,
        hint: report.hint,
      };
    } catch {
      citationGrounding = null;
    }

    const includeBriefing =
      params.includeBriefing === undefined
      || params.includeBriefing === true
      || params.includeBriefing === "true"
      || params.includeBriefing === "1";

    const softNote =
      citationGrounding
      && citationGrounding.softGroundableCount > 0
      && citationGrounding.softUnusedRatio != null
      && citationGrounding.softUnusedRatio >= 0.5
        ? `；soft 未引用 ${citationGrounding.softUnusedCount}/${citationGrounding.softGroundableCount}`
        : "";
    const susNote =
      citationGrounding && citationGrounding.suspiciousCount > 0
        ? `；可疑引用 ${citationGrounding.suspiciousCount}`
        : "";
    const coverNote =
      draftCoverage.requiredGaps.length > 0 || draftCoverage.thinKeys.length > 0
        ? `；薄节/缺口 ${[...new Set([...draftCoverage.requiredGaps, ...draftCoverage.thinKeys])].slice(0, 4).join(",")}`
        : "";
    const nextNote = draftCoverage.nextSectionKey
      ? `建议写 ${draftCoverage.nextSectionKey}`
      : pack.goal;

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
        draftCoverage: {
          requiredGaps: draftCoverage.requiredGaps,
          thinKeys: draftCoverage.thinKeys,
          emptyKeys: draftCoverage.emptyKeys,
          nextSectionKey: draftCoverage.nextSectionKey,
          bodyChars: draftCoverage.bodyChars,
          okRequiredCount: draftCoverage.okRequiredCount,
          requiredCount: draftCoverage.requiredCount,
          sections: draftCoverage.sections.map((s) => ({
            key: s.key,
            chars: s.chars,
            minChars: s.minChars,
            status: s.status,
            ratio: s.ratio,
          })),
          hint: draftCoverage.hint,
        },
        citationGrounding,
        preferredTools: pack.pack.preferredTools,
        constraints: pack.pack.constraints,
        skillHint: `academic-paper Phase ${pack.pack.phase}（${pack.pack.title}）→ 推荐 ${pack.pack.preferredTools.join(" → ") || "对话确认配置"}`,
        ...(includeBriefing ? { briefing } : {}),
      },
      summary: `项目「${project.title}」阶段 ${project.currentPhase ?? "?"}（${pack.pack.title}）；空白节 ${empty.length}；文献 ${project.references.length}；证据 ${claimCount}；可配图 ${plotCandidates}${coverNote}${susNote}${softNote}。${nextNote}`,
    };
  },
};
