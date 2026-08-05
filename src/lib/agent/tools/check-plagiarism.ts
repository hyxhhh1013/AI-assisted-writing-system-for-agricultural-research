import { runPlagiarismCheck } from "@/services/plagiarism-service";
import { getAgentProjectSnapshot } from "@/lib/agent/project-refresh";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

const MAX_CONTENT_CHARS = 80_000;

export const checkPlagiarismTool: ToolDefinition = {
  name: "check_plagiarism",
  description:
    "对一段正文运行查重（自引/跨项目/知识库/语义等；可选联网比对），返回风险等级与主要匹配项",
  parameters: {
    type: "object",
    properties: {
      content: { type: "string", description: "待查重正文" },
      title: { type: "string", description: "可选：查重标题，默认取项目标题" },
      webSearch: {
        type: "string",
        description: "是否启用联网查重（true/false，默认 false）",
      },
    },
    required: ["content"],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    const content = String(params.content ?? "").trim();
    if (!content) {
      return { success: false, error: "content 不能为空" };
    }
    if (content.length > MAX_CONTENT_CHARS) {
      return {
        success: false,
        error: `正文过长（>${MAX_CONTENT_CHARS} 字），请分段查重`,
      };
    }

    let title = String(params.title ?? "").trim();
    if (!title && ctx.projectId) {
      const project = await getAgentProjectSnapshot(ctx);
      title = project?.title ?? "Agent 查重";
    }
    if (!title) title = "Agent 查重";

    const webSearch =
      params.webSearch === true ||
      params.webSearch === "true" ||
      params.webSearch === 1 ||
      params.webSearch === "1";

    try {
      const result = await runPlagiarismCheck({
        projectId: ctx.projectId,
        userId: ctx.userId,
        title,
        content,
        webSearch,
        config: webSearch ? { webSearch: true } : undefined,
      });

      const topMatches = result.matches.slice(0, 8).map((m) => ({
        matchType: m.matchType,
        similarity: Math.round(m.similarity * 1000) / 1000,
        riskLevel: m.riskLevel,
        excerpt: m.matchedText.slice(0, 120),
        source: m.matchedFrom,
      }));

      return {
        success: true,
        data: {
          checkId: result.checkId,
          overallRisk: result.overallRisk,
          maxSimilarity: result.maxSimilarity,
          totalMatches: result.totalMatches,
          stats: result.stats,
          topMatches,
        },
        summary: `查重完成：${result.overallRisk} 风险，最高相似度 ${Math.round(result.maxSimilarity * 100)}%，${result.totalMatches} 处匹配`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  },
};
