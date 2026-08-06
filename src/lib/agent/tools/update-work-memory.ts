import {
  applyWorkMemoryOp,
  formatWorkMemoryBlock,
  type WorkMemoryOp,
} from "@/lib/agent/work-memory";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

const OPS = [
  "set_thesis",
  "add_decision",
  "add_todo",
  "complete_todo",
  "clear_todos",
] as const;

export const updateWorkMemoryTool: ToolDefinition = {
  name: "update_work_memory",
  description:
    "更新本会话工作记忆：核心主张(set_thesis)、已拍板/否决(add_decision)、待办(add_todo/complete_todo)。跨轮承接时优先维护，避免遗忘用户决定",
  parameters: {
    type: "object",
    properties: {
      op: {
        type: "string",
        description: OPS.join(" | "),
        enum: [...OPS],
      },
      text: {
        type: "string",
        description: "主张/决策/待办正文（complete_todo 时可作模糊匹配）",
      },
      id: {
        type: "string",
        description: "待办 id（add_todo / complete_todo 可选）",
      },
    },
    required: ["op"],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    const opName = String(params.op ?? "").trim() as WorkMemoryOp["op"];
    if (!OPS.includes(opName as (typeof OPS)[number])) {
      return { success: false, error: `未知 op，可用：${OPS.join(", ")}` };
    }

    const text = String(params.text ?? "").trim();
    if (
      (opName === "set_thesis" || opName === "add_decision" || opName === "add_todo")
      && !text
    ) {
      return { success: false, error: `${opName} 需要 text` };
    }

    let op: WorkMemoryOp;
    switch (opName) {
      case "set_thesis":
        op = { op: "set_thesis", text };
        break;
      case "add_decision":
        op = { op: "add_decision", text };
        break;
      case "add_todo":
        op = { op: "add_todo", text, id: String(params.id ?? "").trim() || undefined };
        break;
      case "complete_todo":
        op = {
          op: "complete_todo",
          id: String(params.id ?? "").trim() || undefined,
          text: text || undefined,
        };
        break;
      case "clear_todos":
        op = { op: "clear_todos" };
        break;
      default:
        return { success: false, error: "未知 op" };
    }

    const prev = ctx.workMemory ?? null;
    const next = applyWorkMemoryOp(prev, op);
    ctx.workMemory = next;

    const block = formatWorkMemoryBlock(next);
    if (ctx.projectBriefing && block) {
      // 替换旧块或追加
      const stripped = ctx.projectBriefing.replace(
        /【本会话工作记忆】[\s\S]*?(?=\n【|$)/,
        "",
      ).trim();
      ctx.projectBriefing = stripped ? `${stripped}\n\n${block}` : block;
    }

    return {
      success: true,
      data: { workMemory: next, persisted: true },
      summary: `工作记忆已更新（${opName}）`,
    };
  },
};
