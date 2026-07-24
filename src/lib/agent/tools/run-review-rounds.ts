import prisma from "@/lib/prisma";
import { runNextReviewRound, getReviewRoundStatus } from "@/lib/review-rounds";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

export const runReviewRoundsTool: ToolDefinition = {
  name: "run_review_rounds",
  description:
    "按 Passport Phase 7 跑「下一轮」四维审查（最多 2 轮）。已满 2 轮则返回完成状态；第 2 轮会复查上一轮中高严重度问题",
  parameters: {
    type: "object",
    properties: {
      force: {
        type: "string",
        description: "已满 2 轮时是否强制再跑（默认 false）",
      },
    },
    required: [],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "run_review_rounds 需要 projectId" };
    }

    const project = await prisma.project.findFirst({
      where: { id: ctx.projectId, userId: ctx.userId },
      include: {
        sections: true,
        references: { orderBy: { order: "asc" } },
      },
    });
    if (!project) {
      return { success: false, error: "项目不存在或无权访问" };
    }

    const sections = project.sections
      .filter((s) => s.content?.trim())
      .map((s) => ({ key: s.key, title: s.key, content: s.content }));
    if (project.abstract?.trim()) {
      sections.unshift({
        key: "abstract",
        title: "abstract",
        content: project.abstract,
      });
    }
    if (sections.length === 0) {
      return { success: false, error: "没有可审查的章节内容" };
    }

    const force =
      params.force === true || params.force === "true" || params.force === "1";

    const before = await getReviewRoundStatus(ctx.projectId);
    const result = await runNextReviewRound(
      {
        projectId: ctx.projectId,
        title: project.title,
        sections,
        references: project.references.map((r) => r.content),
        projectMode: project.mode === "research" ? "research" : "review",
      },
      { force },
    );

    return {
      success: true,
      data: {
        ran: result.ran,
        round: result.round,
        doneCount: result.status.doneCount,
        maxRounds: result.status.maxRounds,
        complete: result.status.complete,
        overallScore: result.report?.overallScore,
        grade: result.report?.overallGrade,
        topIssues: result.topIssues,
        nextHint: result.nextHint,
        previousDoneCount: before.doneCount,
      },
      summary: result.ran
        ? `第 ${result.round}/${result.status.maxRounds} 轮审查完成` +
          (result.report
            ? `：${result.report.overallScore}分（${result.report.overallGrade}）`
            : "") +
          `。${result.nextHint}`
        : result.nextHint,
    };
  },
};
