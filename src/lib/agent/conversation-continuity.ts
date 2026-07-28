import type { AgentSessionSnapshot, AgentUiMessage } from "@/contracts/agent-session";
import type { LLMMessage } from "@/lib/agent/types";
import { lastSummaryText } from "@/lib/agent/ui-transcript";

const MAX_PRIOR_TURNS = 3;
const MAX_PRIOR_CHARS = 1800;

/**
 * 把近期会话压成 LLM 可直接续聊的 user/assistant 轮次。
 * 让新 goal 不只靠简报里的一行摘要，而是真能看到「刚才聊了什么」。
 */
export function buildPriorConversationMessages(
  sessions: {
    goal: string;
    status: string;
    snapshot: AgentSessionSnapshot | null;
  }[],
): LLMMessage[] {
  const turns: LLMMessage[] = [];
  let budget = MAX_PRIOR_CHARS;

  // sessions 假定为时间正序（旧→新）
  const recent = sessions.slice(-MAX_PRIOR_TURNS);
  for (const s of recent) {
    if (budget <= 80) break;
    const goal = truncate(s.goal.replace(/\s+/g, " ").trim(), 120);
    if (!goal) continue;

    const reply =
      (s.snapshot?.uiTranscript
        ? lastSummaryText(s.snapshot.uiTranscript)
        : null)
      ?? lastAssistantFromLlm(s.snapshot)
      ?? (s.status === "interrupted" ? "（上次对话中断，尚未给出完整结论）" : null);

    if (!reply) continue;

    const userMsg = truncate(`【上一轮用户】${goal}`, Math.min(160, budget));
    budget -= userMsg.length;
    turns.push({ role: "user", content: userMsg });

    const asst = truncate(`【上一轮助手】${reply}`, Math.min(400, budget));
    budget -= asst.length;
    turns.push({ role: "assistant", content: asst });
  }

  return turns;
}

function lastAssistantFromLlm(snap: AgentSessionSnapshot | null): string | null {
  if (!snap) return null;
  for (let i = snap.messages.length - 1; i >= 0; i--) {
    const m = snap.messages[i];
    if (m.role === "assistant" && m.content.trim()) {
      return truncate(m.content.replace(/\s+/g, " ").trim(), 280);
    }
  }
  return null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

/** 从 UI 气泡里抽出可用于 memory 的结论句 */
export function transcriptConclusion(ui: AgentUiMessage[] | undefined): string | null {
  if (!ui?.length) return null;
  return lastSummaryText(ui);
}
