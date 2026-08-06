import prisma from "@/lib/prisma";
import { runReview } from "@/services/review-service";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

export const reviewContentTool: ToolDefinition = {
  name: "review_content",
  description: "对论文全文或指定章节执行四维度审查（学术/论证/结构/诚信），返回结构化报告",
  parameters: {
    type: "object",
    properties: {
      projectId: { type: "string", description: "项目 ID；提供则从数据库加载章节" },
      title: { type: "string", description: "论文标题（无 projectId 时必填）" },
      sections: {
        type: "string",
        description: "JSON 字符串：[{key,title,content}]，无 projectId 时使用",
      },
      projectMode: {
        type: "string",
        enum: ["review", "research"],
        description: "写作模式",
      },
    },
    required: [],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    const projectId = params.projectId
      ? String(params.projectId)
      : ctx.projectId;

    let title = params.title ? String(params.title) : "未命名论文";
    let sections: Array<{ key: string; title: string; content: string }> = [];
    let references: string[] | undefined;
    const projectMode =
      params.projectMode === "research" ? "research" : "review";

    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: ctx.userId },
        include: {
          sections: true,
          references: { orderBy: { order: "asc" } },
        },
      });
      if (!project) {
        return { success: false, error: "项目不存在或无权访问" };
      }
      title = project.title;
      sections = project.sections.map((s) => ({
        key: s.key,
        title: s.key,
        content: s.content,
      }));
      references = project.references.map((r) => r.content);
    } else if (params.sections) {
      try {
        const parsed = JSON.parse(String(params.sections)) as Array<{
          key: string;
          title: string;
          content: string;
        }>;
        sections = parsed;
      } catch {
        return { success: false, error: "sections 必须是合法 JSON 数组" };
      }
    } else {
      return {
        success: false,
        error: "请提供 projectId 或 sections",
      };
    }

    const nonEmpty = sections.filter((s) => s.content?.trim());
    if (nonEmpty.length === 0) {
      return { success: false, error: "没有可审查的章节内容" };
    }

    const report = await runReview(
      {
        projectId,
        title,
        sections: nonEmpty,
        references,
        projectMode,
      },
      { projectMode },
    );

    const issueCount = Object.values(report.dimensions).reduce(
      (sum, d) => sum + d.issueCount,
      0,
    );

    return {
      success: true,
      data: {
        overallScore: report.overallScore,
        grade: report.overallGrade,
        synopsis: report.synopsis,
        summary: report.summary,
        issueCount,
        dimensions: report.dimensions,
      },
      summary: `审查完成：总分 ${report.overallScore}（${report.overallGrade}），${issueCount} 个问题`,
    };
  },
};
