import type { ToolDefinition } from "@/lib/agent/types";

/**
 * 向用户提问确认 / 收集补充信息（方案 A：意图澄清）。
 * 调用后会话暂停到 awaiting_checkpoint（kind=clarify），UI 显示问题 + 输入框，
 * 用户回答后注入 messages 继续执行。用于指令模糊、缺信息、或写操作有风险时。
 */
export const askUserTool: ToolDefinition = {
  name: "ask_user",
  description:
    "当用户指令模糊、缺少必要信息、或要执行可能改动正文的操作且不确定时，"
    + "调用本工具向用户提一个问题以确认意图或收集补充信息。"
    + "调用后会暂停执行并等待你的回答。请把问题写清楚，尽量给出可选项或默认建议，让用户容易回答。",
  parameters: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "向用户提的问题（一句话；尽量给出选项或默认建议，便于用户快速回答）",
      },
    },
    required: ["question"],
  },
  safety: "read",
  async execute(params) {
    const question = String(params.question ?? "").trim();
    if (!question) {
      return { success: false, error: "缺少 question" };
    }
    return {
      success: true,
      summary: `已向用户提问：${question.slice(0, 80)}`,
      data: { needClarification: true, question },
    };
  },
};
