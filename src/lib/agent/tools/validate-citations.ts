import { validateCitations } from "@/lib/citation";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

export const validateCitationsTool: ToolDefinition = {
  name: "validate_citations",
  description: "检查正文中的引用编号是否在提供的检索上下文中存在，并标记越界或低重叠引用",
  parameters: {
    type: "object",
    properties: {
      draftText: { type: "string", description: "待检查的正文（含 [1] 等引用）" },
      contextText: { type: "string", description: "RAG 检索上下文或参考文献摘要文本" },
    },
    required: ["draftText", "contextText"],
  },
  safety: "read",
  async execute(params, _ctx: AgentContext) {
    const draftText = String(params.draftText ?? "");
    const contextText = String(params.contextText ?? "");

    if (!draftText.trim()) {
      return { success: false, error: "draftText 不能为空" };
    }

    const checks = validateCitations(draftText, contextText);
    const issues = checks.filter((c) => !c.passed || c.overlap < 0.15);

    return {
      success: true,
      data: {
        totalChecks: checks.length,
        issueCount: issues.length,
        issues: issues.map((c) => ({
          number: c.number,
          passed: c.passed,
          overlap: c.overlap,
          citedSentence: c.citedSentence?.slice(0, 120),
        })),
      },
      summary: issues.length === 0
        ? `引用检查通过（${checks.length} 处引用）`
        : `发现 ${issues.length} 处引用问题`,
    };
  },
};
