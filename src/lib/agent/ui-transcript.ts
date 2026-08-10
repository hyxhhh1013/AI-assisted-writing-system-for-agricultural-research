import type { AgentSSEEvent, AgentSummary } from "@/contracts/agent";
import type { AgentUiMessage } from "@/contracts/agent-session";

/** 从 SSE 事件增量拼 UI 对话气泡 */
export function appendUiFromAgentEvent(
  transcript: AgentUiMessage[],
  event: AgentSSEEvent,
): AgentUiMessage[] {
  switch (event.type) {
    case "agent/thought": {
      const text = event.content?.trim();
      if (!text) return transcript;
      return [...transcript, { kind: "thought", text }];
    }
    case "agent/action":
      return [
        ...transcript,
        { kind: "action", tool: event.tool, params: event.params },
      ];
    case "agent/observation": {
      const data = event.result?.data;
      const dataObj =
        data && typeof data === "object" ? (data as Record<string, unknown>) : null;
      const imageUrl =
        dataObj && typeof dataObj.imageUrl === "string"
          ? dataObj.imageUrl
          : undefined;
      const rawHref =
        dataObj && typeof dataObj.href === "string" && dataObj.href.startsWith("/plot")
          ? dataObj.href
          : undefined;
      let plotHref = rawHref;
      if (rawHref && imageUrl && !rawHref.includes("replaceImageUrl=")) {
        const sep = rawHref.includes("?") ? "&" : "?";
        plotHref = `${rawHref}${sep}replaceImageUrl=${encodeURIComponent(imageUrl)}`;
      }
      const sectionKey =
        dataObj && typeof dataObj.insertedSection === "string"
          ? dataObj.insertedSection
          : dataObj?.persisted
            && typeof dataObj.persisted === "object"
            && typeof (dataObj.persisted as { sectionKey?: unknown }).sectionKey === "string"
            ? String((dataObj.persisted as { sectionKey: string }).sectionKey)
            : undefined;
      const insertMode =
        dataObj && typeof dataObj.insertMode === "string"
          ? dataObj.insertMode
          : undefined;
      // 精修回放：只留轻量字段，避免 uiTranscript 塞入整份 config
      const figureSpecEnc =
        dataObj && typeof dataObj.figureSpecEnc === "string"
          ? dataObj.figureSpecEnc
          : undefined;
      const chartAssetId =
        dataObj?.persisted
        && typeof dataObj.persisted === "object"
        && typeof (dataObj.persisted as { id?: unknown }).id === "string"
          ? String((dataObj.persisted as { id: string }).id)
          : undefined;
      return [
        ...transcript,
        {
          kind: "observation",
          tool: event.tool,
          summary: event.result?.summary,
          error: event.error ?? event.result?.error,
          ...(imageUrl ? { imageUrl } : {}),
          ...(plotHref ? { plotHref } : {}),
          ...(imageUrl ? { replaceImageUrl: imageUrl } : {}),
          ...(sectionKey ? { sectionKey } : {}),
          ...(insertMode ? { insertMode } : {}),
          ...((figureSpecEnc || chartAssetId)
            ? {
                data: {
                  ...(figureSpecEnc ? { figureSpecEnc } : {}),
                  ...(chartAssetId ? { persisted: { id: chartAssetId } } : {}),
                },
              }
            : {}),
        },
      ];
    }
    case "agent/checkpoint":
      return [
        ...transcript,
        {
          kind: "thought",
          text: `${event.checkpoint.title}：${event.checkpoint.message}`,
        },
      ];
    case "agent/complete":
      return [...transcript, { kind: "summary", summary: event.summary }];
    default:
      return transcript;
  }
}

export function seedUiTranscript(goal: string): AgentUiMessage[] {
  const text = goal.trim();
  return text ? [{ kind: "user", text }] : [];
}

/** 合并多会话气泡（按时间正序），用于项目历史回放；会话之间插入分隔线 */
export function mergeSessionTranscripts(
  sessions: { uiTranscript?: AgentUiMessage[]; goal: string }[],
): AgentUiMessage[] {
  const out: AgentUiMessage[] = [];
  let sessionIndex = 0;
  for (const s of sessions) {
    const chunk: AgentUiMessage[] = [];
    if (s.uiTranscript && s.uiTranscript.length > 0) {
      chunk.push(...s.uiTranscript.filter((m) => m.kind !== "divider"));
    } else {
      const goal = s.goal.trim();
      if (goal) chunk.push({ kind: "user", text: goal });
    }
    if (chunk.length === 0) continue;
    if (sessionIndex > 0) {
      out.push({ kind: "divider", label: `上一会话 · ${sessionIndex + 1}` });
    }
    out.push(...chunk);
    sessionIndex += 1;
  }
  return out;
}

export function lastSummaryText(transcript: AgentUiMessage[]): string | null {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const m = transcript[i];
    if (m.kind === "summary" && m.summary.text.trim()) {
      return m.summary.text.trim();
    }
    if (m.kind === "thought" && m.text.trim()) {
      return m.text.trim();
    }
  }
  return null;
}

export function isAgentSummary(value: unknown): value is AgentSummary {
  if (!value || typeof value !== "object") return false;
  const v = value as { text?: unknown; toolCallCount?: unknown; keyFindings?: unknown };
  return typeof v.text === "string" && typeof v.toolCallCount === "number" && Array.isArray(v.keyFindings);
}

export function isAgentUiMessage(value: unknown): value is AgentUiMessage {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: unknown }).kind;
  if (kind === "user" || kind === "thought") {
    return typeof (value as { text?: unknown }).text === "string";
  }
  if (kind === "action") {
    const v = value as { tool?: unknown; params?: unknown };
    return typeof v.tool === "string" && !!v.params && typeof v.params === "object";
  }
  if (kind === "observation") {
    return typeof (value as { tool?: unknown }).tool === "string";
  }
  if (kind === "summary") {
    return isAgentSummary((value as { summary?: unknown }).summary);
  }
  if (kind === "divider") {
    const label = (value as { label?: unknown }).label;
    return label === undefined || typeof label === "string";
  }
  return false;
}

export function normalizeUiTranscript(value: unknown): AgentUiMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isAgentUiMessage);
}
