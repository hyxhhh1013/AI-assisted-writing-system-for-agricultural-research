import type {
  AgentCheckpointDecision,
  AgentCheckpointKind,
  AgentCheckpointRequest,
} from "@/contracts/agent";
import {
  isAcademicPaperPipelineGoal,
  isSectionDraftGoal,
} from "@/lib/agent/core/goal-intents";
import type { LLMMessage, ParsedToolCall } from "@/lib/agent/types";

/** 整篇 / academic-paper 自主推进类目标 → 需要大纲批准检查点 */
export function isApFullStyleGoal(goal: string): boolean {
  return /academic-paper|整篇|全文|一键|完整论文|自主推进|八阶段|从零|从头写/.test(
    goal,
  );
}

export function shouldPauseForOutlineApprove(input: {
  goal: string;
  toolName: string;
  toolSuccess: boolean;
  persisted?: boolean;
  approvedKinds: readonly AgentCheckpointKind[];
}): boolean {
  if (!input.toolSuccess || input.toolName !== "generate_outline") return false;
  if (input.persisted === false) return false;
  if (input.approvedKinds.includes("outline_approve")) return false;
  return isApFullStyleGoal(input.goal);
}

export function shouldPauseForConfigConfirm(input: {
  goal: string;
  intentKind?: import("@/contracts/agent-intent").IntentKind | null;
  hasPaperConfig: boolean;
  approvedKinds: readonly AgentCheckpointKind[];
}): boolean {
  if (input.hasPaperConfig) return false;
  if (input.approvedKinds.includes("config_confirm")) return false;
  // 仅「从零写整篇 / academic-paper 流程 / 起草某节」等写作目标需要先做论文配置问答；
  // 诊断 / 检索 / 引用核查 / 审查 / 分类编码等与论文配置无关的目标不应被配置问答拦一道。
  if (input.intentKind !== undefined) {
    return (
      input.intentKind === "ap_full"
      || input.intentKind === "draft"
      || input.intentKind === "review_write"
    );
  }
  return (
    isApFullStyleGoal(input.goal)
    || isAcademicPaperPipelineGoal(input.goal)
    || isSectionDraftGoal(input.goal)
  );
}

export function buildOutlineCheckpoint(preview: string): AgentCheckpointRequest {
  const trimmed = preview.trim();
  return {
    id: `cp_outline_${Date.now()}`,
    kind: "outline_approve",
    title: "一起确认大纲",
    message:
      "我已把大纲写回项目。请你过目：满意就点「批准并继续」，我会再问你下一步（论证 / 写某一节）；要改就点「需修改」并告诉我怎么改。",
    preview: trimmed.slice(0, 2000) + (trimmed.length > 2000 ? "…" : ""),
  };
}

/** 生成写作蓝图后 → 用户确认（论证已并入写作蓝图，不再对 build_argument_blueprint 暂停） */
export function shouldPauseForBlueprintApprove(input: {
  goal: string;
  toolName: string;
  toolSuccess: boolean;
  persisted?: boolean;
  approvedKinds: readonly AgentCheckpointKind[];
}): boolean {
  if (!input.toolSuccess) return false;
  if (input.toolName !== "generate_writing_blueprint") return false;
  if (input.persisted === false) return false;
  if (input.approvedKinds.includes("blueprint_approve")) return false;
  return isApFullStyleGoal(input.goal);
}

export function buildBlueprintCheckpoint(preview: string): AgentCheckpointRequest {
  const trimmed = preview.trim();
  return {
    id: `cp_blueprint_${Date.now()}`,
    kind: "blueprint_approve",
    title: "一起确认写作蓝图",
    message:
      "写作蓝图已生成（叙事、各节要点与主张/证据、配图计划）。过目后点「批准」，我就按蓝图往下写；要改就点「需修改」并告诉我怎么调整。",
    preview: trimmed.slice(0, 2000) + (trimmed.length > 2000 ? "…" : ""),
  };
}

export function buildConfigCheckpoint(): AgentCheckpointRequest {
  return {
    id: `cp_config_${Date.now()}`,
    kind: "config_confirm",
    title: "先聊聊论文基本信息",
    message:
      "还没有完整论文配置。我们一问一答：题目 → 类型 → 语言 → 引用格式 → 篇幅 → 目标期刊。答完确认即可继续；也可跳过先聊。",
  };
}

/** 通用澄清检查点（ask_user 工具触发）：Agent 提问，用户输入回答后继续 */
export function buildClarifyCheckpoint(question: string): AgentCheckpointRequest {
  return {
    id: `cp_clarify_${Date.now()}`,
    kind: "clarify",
    title: "需要你确认一下",
    message: question,
  };
}

export function decisionMessage(
  kind: AgentCheckpointKind,
  decision: "approve" | "revise",
  note?: string,
): string {
  if (kind === "clarify") {
    return note?.trim()
      ? `【用户回答】${note.trim()}\n请据此继续执行；若仍有疑问可再调用 ask_user。`
      : "【用户回答】已收到你的回复。请继续。";
  }
  if (kind === "outline_approve") {
    if (decision === "approve") {
      return "【检查点】用户已批准大纲。请用中文简短确认，并询问下一步：生成写作蓝图 / 写某一节？不要擅自写完整篇。";
    }
    return `【检查点】用户要求修改大纲。${note?.trim() ? `意见：${note.trim()}。` : ""}请先沟通或重新 generate_outline，改完后再请用户确认。`;
  }
  if (kind === "blueprint_approve") {
    if (decision === "approve") {
      return "【检查点】用户已批准写作蓝图。请严格按蓝图各节要点与主张/证据推进写作，不要擅自偏离蓝图结构。";
    }
    return `【检查点】用户要求修改写作蓝图。${note?.trim() ? `意见：${note.trim()}。` : ""}请先沟通或重新 generate_writing_blueprint，改完再请用户确认。`;
  }
  if (decision === "approve") {
    return note?.trim()
      ? `【检查点】用户已通过问答保存论文配置（${note.trim()}）。请 inspect_project，用中文确认配置并建议下一步。`
      : "【检查点】用户跳过配置问答、先按现状继续。请 inspect_project，然后用中文建议下一步并征求同意。";
  }
  return `【检查点】用户希望先完善配置。${note?.trim() ? `说明：${note.trim()}。` : ""}请继续用问答协助完善（update_paper_config），不要甩到其他 Tab。`;
}

/** 从 checkpointId / hint 解析 kind（与 run-graph 续跑映射一致） */
export function resolveCheckpointKind(
  decision: AgentCheckpointDecision,
  kindHint?: AgentCheckpointKind,
): AgentCheckpointKind {
  if (kindHint) return kindHint;
  if (decision.checkpointId.includes("config")) return "config_confirm";
  if (decision.checkpointId.includes("blueprint")) return "blueprint_approve";
  if (decision.checkpointId.includes("clarify")) return "clarify";
  return "outline_approve";
}

export interface CheckpointDecisionStateSlice {
  approvedCheckpointKinds?: AgentCheckpointKind[];
  messages?: LLMMessage[];
  pendingToolCalls?: ParsedToolCall[];
}

/**
 * 将用户检查点决定写入图状态。
 * 「需修改」(revise) 必须清空 pendingToolCalls：否则 agentNode 短路放行旧排队工具，
 * 修改意见进不了 LLM，可能直接重跑 write_section。
 */
export function applyCheckpointDecisionPatch(
  state: CheckpointDecisionStateSlice,
  decision: AgentCheckpointDecision,
  kindHint?: AgentCheckpointKind,
): CheckpointDecisionStateSlice {
  const kind = resolveCheckpointKind(decision, kindHint);
  const prev = state.approvedCheckpointKinds ?? [];
  const approved =
    decision.decision === "approve" && kind !== "clarify"
      ? Array.from(new Set([...prev, kind]))
      : prev;
  const patch: CheckpointDecisionStateSlice = {
    approvedCheckpointKinds: approved,
    messages: [
      ...(state.messages ?? []),
      {
        role: "user",
        content: decisionMessage(kind, decision.decision, decision.note),
      },
    ],
  };
  if (decision.decision === "revise") {
    patch.pendingToolCalls = [];
  }
  return patch;
}
