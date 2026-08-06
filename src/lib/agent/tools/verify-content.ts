import { callAINonStreaming, getAgentModelConfig } from "@/lib/ai";
import { buildVerifierPrompt, buildVerifierSystemPrompt } from "@/lib/prompts";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

export const verifyContentTool: ToolDefinition = {
  name: "verify_content",
  description: "用 Verifier 模型审查一段正文：引用准确性、过度声称、Results/Discussion 混淆等",
  parameters: {
    type: "object",
    properties: {
      draftText: { type: "string", description: "待核查正文" },
      contextText: { type: "string", description: "支撑该段落的检索上下文或文献摘要" },
      projectMode: {
        type: "string",
        description: "review 或 research",
        enum: ["review", "research"],
      },
    },
    required: ["draftText", "contextText"],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    const draftText = String(params.draftText ?? "").trim();
    const contextText = String(params.contextText ?? "").trim();
    if (!draftText) {
      return { success: false, error: "draftText 不能为空" };
    }

    const projectMode =
      params.projectMode === "research" ? "research" : "review";

    const { provider, keyError } = getAgentModelConfig("verifier");
    if (keyError) {
      return { success: false, error: keyError };
    }

    const systemPrompt = buildVerifierSystemPrompt("audit", projectMode);
    const userPrompt = buildVerifierPrompt({
      contextText: contextText || "（无额外上下文）",
      content: draftText,
      globalReferenceInfo: "",
      fullSourceTexts: "",
      projectMode,
    });

    const report = await callAINonStreaming({
      provider,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      signal: ctx.signal,
      userId: ctx.userId,
      timeoutMs: 120_000,
    });

    return {
      success: true,
      data: { report },
      summary: `Verifier 报告已生成（${report.length} 字）`,
    };
  },
};
