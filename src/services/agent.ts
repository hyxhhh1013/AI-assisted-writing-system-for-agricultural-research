"use client";

import type { AgentRequest, AgentSSEEvent } from "@/contracts/agent";
import type { AgentSessionListItem } from "@/contracts/agent-session";
import { isAgentSSEEvent } from "@/contracts/agent";

export async function postAgentStream(
  request: AgentRequest,
  options: {
    signal?: AbortSignal;
    onEvent: (event: AgentSSEEvent) => void;
  },
): Promise<void> {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: options.signal,
  });

  if (!res.ok) {
    let message = `Agent 请求失败 (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("无响应体");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data:")) continue;

      try {
        const parsed: unknown = JSON.parse(trimmed.slice(5).trim());
        if (isAgentSSEEvent(parsed)) {
          options.onEvent(parsed);
        }
      } catch {
        /* skip malformed */
      }
    }
  }
}

export async function listAgentSessions(params: {
  projectId?: string;
  status?: string;
}): Promise<AgentSessionListItem[]> {
  const qs = new URLSearchParams();
  if (params.projectId) qs.set("projectId", params.projectId);
  if (params.status) qs.set("status", params.status);
  const res = await fetch(`/api/agent/sessions?${qs.toString()}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "无法加载 Agent 会话");
  }
  const data = (await res.json()) as { sessions: AgentSessionListItem[] };
  return data.sessions ?? [];
}
