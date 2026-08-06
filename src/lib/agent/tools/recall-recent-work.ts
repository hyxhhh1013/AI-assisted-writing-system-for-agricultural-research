import {
  appendMemoryToBriefing,
  buildRecentAgentMemoryBlock,
} from "@/lib/agent/session-memory";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

/**
 * 显式调取同项目近期 Agent 工作记忆（简报已自动注入摘要；需要细节时再调）。
 */
export const recallRecentWorkTool: ToolDefinition = {
  name: "recall_recent_work",
  description:
    "回顾本项目近期 Agent 对话轮次（目标、用过的工具、结论摘要）。承接上次未完成工作时调用",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "最多回顾几轮，默认 5，上限 8",
      },
    },
    required: [],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    if (!ctx.projectId) {
      return { success: false, error: "recall_recent_work 需要绑定 projectId" };
    }
    const limit = Math.min(Math.max(Number(params.limit) || 5, 1), 8);
    const block = await buildRecentAgentMemoryBlock(ctx.userId, ctx.projectId, {
      limit,
    });
    if (!block) {
      return {
        success: true,
        data: { entries: [], memory: "" },
        summary: "尚无近期 Agent 会话可回顾",
      };
    }
    if (ctx.projectBriefing) {
      ctx.projectBriefing = appendMemoryToBriefing(ctx.projectBriefing, block);
    }
    return {
      success: true,
      data: { memory: block },
      summary: `已加载近期 ${limit} 轮工作记忆`,
    };
  },
};
