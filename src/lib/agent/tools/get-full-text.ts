import { localRAG } from "@/lib/rag";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import { recordSourceKeyRead, fullReadBudgetError, resolveRefIndexBySourceKey } from "@/lib/agent/reading-pack";

const MAX_CHARS = 12_000;

export const getFullTextTool: ToolDefinition = {
  name: "read_full_text",
  description: "读取知识库中某篇文献的全文（按文件名）。本会话最多 4 篇全文，超出请用摘要写作。",
  parameters: {
    type: "object",
    properties: {
      sourceKey: { type: "string", description: "文献 source 标识（知识库文件名）" },
    },
    required: ["sourceKey"],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    const sourceKey = String(params.sourceKey ?? "").trim();
    if (!sourceKey) {
      return { success: false, error: "sourceKey 不能为空" };
    }

    const n = resolveRefIndexBySourceKey(
      sourceKey,
      ctx.projectSnapshot?.referenceSourceNames,
    );
    const budget = fullReadBudgetError(ctx, n);
    if (budget) {
      return { success: false, error: budget };
    }

    const fullText = await localRAG.getFullText(sourceKey);
    if (!fullText) {
      return { success: false, error: `未找到文献：${sourceKey}` };
    }

    const truncated = fullText.length > MAX_CHARS;
    const text = truncated
      ? fullText.slice(0, MAX_CHARS / 2) + "\n…[省略]…\n" + fullText.slice(-MAX_CHARS / 2)
      : fullText;

    recordSourceKeyRead(ctx, sourceKey, "full");

    return {
      success: true,
      data: { sourceKey, charCount: fullText.length, truncated, text },
      summary: `已读取 ${sourceKey}（${fullText.length} 字${truncated ? "，已截断" : ""}）`,
    };
  },
};
