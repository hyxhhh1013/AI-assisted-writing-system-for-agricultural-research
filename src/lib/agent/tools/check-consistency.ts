import { callAI, getAIError } from "@/lib/ai";
import { buildConsistencyPrompt } from "@/lib/prompts/consistency";
import type { ConsistencyReport } from "@/contracts/consistency";
import prisma from "@/lib/prisma";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

/** 从 AI 原始文本解析一致性报告（容错 JSON） */
function parseConsistencyReport(rawText: string): ConsistencyReport {
  const fallback = (reason: string): ConsistencyReport => ({
    passed: false,
    issues: [
      {
        type: "logic",
        severity: "medium",
        sections: [],
        description: reason,
        suggestion: "请重试一致性检查",
      },
    ],
    summary: rawText.slice(0, 500),
  });
  try {
    return JSON.parse(rawText.trim()) as ConsistencyReport;
  } catch {
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim()) as ConsistencyReport;
      } catch {
        return fallback("AI 返回的 JSON 格式异常");
      }
    }
    return fallback("AI 未按 JSON 格式返回");
  }
}

/** 一致性检查：自动读取项目全部章节，检查数据/术语/结论/逻辑矛盾 */
export const checkConsistencyTool: ToolDefinition = {
  name: "check_consistency",
  description:
    "检查论文各章节之间的一致性（数据引用、术语口径、结论逻辑矛盾）。"
    + "自动读取项目全部章节（可传 sections 覆盖）；返回报告：passed/issues/summary。"
    + "发现问题后可用 refine_content 针对相关章节修正。",
  parameters: {
    type: "object",
    properties: {
      sections: {
        type: "object",
        description: "可选：覆盖章节内容 {key: content}；省略则自动读项目全部章节",
      },
      projectMode: {
        type: "string",
        enum: ["review", "research"],
        description: "可选：review 或 research",
      },
    },
    required: [],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "check_consistency 需要关联 projectId" };
    }

    const override =
      params.sections && typeof params.sections === "object"
        ? (params.sections as Record<string, string>)
        : undefined;

    let title = "";
    let outline = "";
    let sections: { key: string; content: string }[] = [];

    if (override) {
      sections = Object.entries(override)
        .filter(([, c]) => c?.trim())
        .map(([key, content]) => ({ key, content }));
    } else {
      const project = await prisma.project.findFirst({
        where: { id: ctx.projectId, userId: ctx.userId },
        select: {
          title: true,
          outline: true,
          abstract: true,
          mode: true,
          sections: { select: { key: true, content: true } },
        },
      });
      if (!project) {
        return { success: false, error: "项目不存在或无权访问" };
      }
      title = project.title ?? "";
      outline = project.outline ?? "";
      sections = project.sections
        .filter((s) => s.content?.trim())
        .map((s) => ({ key: s.key, content: s.content ?? "" }));
      if (project.abstract?.trim()) {
        sections.push({ key: "abstract", content: project.abstract });
      }
    }

    if (sections.length < 2) {
      return {
        success: false,
        error: "至少需要两个非空章节才能检查一致性",
      };
    }

    const keyError = getAIError("deepseek");
    if (keyError) {
      return { success: false, error: keyError };
    }

    const prompt = buildConsistencyPrompt({
      title,
      sections,
      outline,
      dataClaims: [],
      projectMode: params.projectMode === "research" ? "research" : "review",
    });

    try {
      const response = await callAI({
        provider: "deepseek",
        messages: [
          {
            role: "system",
            content:
              "你是一名严谨的学术论文一致性审查专家。严格按照输出格式返回 JSON，不要包含任何其他内容。",
          },
          { role: "user", content: prompt },
        ],
        stream: false,
      });
      const rawJson = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawText = rawJson.choices?.[0]?.message?.content ?? "";
      if (!rawText) {
        return {
          success: false,
          error: "AI 未返回有效响应，请重试",
        };
      }
      const report = parseConsistencyReport(rawText);
      const issueCount = report.issues?.length ?? 0;
      return {
        success: true,
        data: report,
        summary: `一致性检查${report.passed ? "通过" : `发现 ${issueCount} 处问题`}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  },
};
