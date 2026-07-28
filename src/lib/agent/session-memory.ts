import {
  getAgentSessionForUser,
  listAgentSessions,
} from "@/lib/agent/session-store";
import type { AgentSessionSnapshot } from "@/contracts/agent-session";
import { transcriptConclusion } from "@/lib/agent/conversation-continuity";
import { normalizeWorkMemory } from "@/lib/agent/work-memory";

const MAX_MEMORY_CHARS = 2800;
const MAX_SESSIONS = 6;

/**
 * 从同项目近期 Agent 会话压缩「跨轮记忆」，注入简报。
 * 不做二次 LLM 调用；并行拉取快照，避免串行 N+1 拖慢开跑。
 */
export async function buildRecentAgentMemoryBlock(
  userId: string,
  projectId: string,
  options?: { excludeSessionId?: string; limit?: number },
): Promise<string> {
  const limit = Math.min(options?.limit ?? MAX_SESSIONS, 8);
  const sessions = await listAgentSessions({
    userId,
    projectId,
    limit: limit + 2,
  });

  const candidates = sessions.filter((item) => {
    if (options?.excludeSessionId && item.id === options.excludeSessionId) return false;
    if (item.status === "running") return false;
    return true;
  }).slice(0, limit);

  const details = await Promise.all(
    candidates.map(async (item) => {
      const full = await getAgentSessionForUser(item.id, userId);
      return { item, snap: full?.snapshot ?? null };
    }),
  );

  const lines: string[] = [];
  for (const { item, snap } of details) {
    const goal = truncate(item.goal.replace(/\s+/g, " ").trim(), 100);
    const statusLabel =
      item.status === "completed"
        ? "完成"
        : item.status === "interrupted"
          ? "中断"
          : item.status === "error"
            ? "失败"
            : item.status;

    const bits: string[] = [`[${statusLabel}] ${goal}`];
    if (snap) {
      const tools = summarizeTools(snap);
      if (tools) bits.push(`工具：${tools}`);
      const thought =
        transcriptConclusion(snap.uiTranscript) ?? lastAssistantThought(snap);
      if (thought) bits.push(`结论：${thought}`);
      if (snap.awaitingCheckpoint) {
        bits.push(`待确认：${snap.awaitingCheckpoint.kind}`);
      }
      if (snap.awaitingConfirm) {
        bits.push(`待确认工具：${snap.awaitingConfirm.tool}`);
      }
      const wm = normalizeWorkMemory(snap.workMemory);
      if (wm?.thesis) bits.push(`主张：${truncate(wm.thesis, 60)}`);
    }
    lines.push(`- ${bits.join("；")}`);
  }

  if (lines.length === 0) return "";

  const body = lines.join("\n");
  const clipped =
    body.length > MAX_MEMORY_CHARS
      ? `${body.slice(0, MAX_MEMORY_CHARS)}…`
      : body;
  return `【近期对话记忆】（同项目最近 ${lines.length} 轮，供承接上下文；以当前目标为准）\n${clipped}`;
}

export function appendMemoryToBriefing(
  briefing: string,
  memoryBlock: string,
): string {
  const mem = memoryBlock.trim();
  if (!mem) return briefing;
  const base = briefing.trim();
  return base ? `${base}\n\n${mem}` : mem;
}

function summarizeTools(snap: AgentSessionSnapshot): string {
  const names = snap.toolSummaries
    .map((line) => {
      const m = line.match(/^\[([^\]]+)\]/);
      return m?.[1] ?? "";
    })
    .filter(Boolean);
  if (names.length === 0) return "";
  const uniq: string[] = [];
  for (const n of names) {
    if (!uniq.includes(n)) uniq.push(n);
  }
  return uniq.slice(0, 8).join(", ");
}

function lastAssistantThought(snap: AgentSessionSnapshot): string | null {
  for (let i = snap.messages.length - 1; i >= 0; i--) {
    const m = snap.messages[i];
    if (m.role === "assistant" && m.content.trim()) {
      return truncate(m.content.replace(/\s+/g, " ").trim(), 160);
    }
  }
  return null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
