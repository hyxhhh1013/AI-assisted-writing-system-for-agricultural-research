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
  includeTranscript?: boolean;
  history?: boolean;
}): Promise<AgentSessionListItem[]> {
  const qs = new URLSearchParams();
  if (params.projectId) qs.set("projectId", params.projectId);
  if (params.status) qs.set("status", params.status);
  if (params.includeTranscript) qs.set("includeTranscript", "1");
  if (params.history) qs.set("history", "1");
  const res = await fetch(`/api/agent/sessions?${qs.toString()}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "无法加载 Agent 会话");
  }
  const data = (await res.json()) as { sessions: AgentSessionListItem[] };
  return data.sessions ?? [];
}

/** 同项目聊天历史（时间正序，含 uiTranscript） */
export async function loadAgentChatHistory(
  projectId: string,
): Promise<AgentSessionListItem[]> {
  return listAgentSessions({ projectId, history: true });
}

/** 上传附件：成功返回附件信息，失败抛出带后端 error 文案的错误 */
export async function postAgentAttachment(
  file: File,
  sessionId?: string,
  signal?: AbortSignal,
): Promise<{ attachment: import("@/contracts/agent-attachment").AgentAttachmentInfo }> {
  const form = new FormData();
  form.append("file", file);
  if (sessionId) form.append("sessionId", sessionId);
  const res = await fetch("/api/agent/attachments", {
    method: "POST",
    body: form,
    signal,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "上传失败");
  }
  return (await res.json()) as { attachment: import("@/contracts/agent-attachment").AgentAttachmentInfo };
}

/** DELETE /api/agent/attachments/[id] — 删除附件（服务端同步清 DB + 磁盘） */
export async function deleteAgentAttachment(
  attachmentId: string,
  sessionId?: string,
): Promise<void> {
  const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
  const res = await fetch(`/api/agent/attachments/${encodeURIComponent(attachmentId)}${qs}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "删除失败");
  }
}

/** GET /api/agent/attachments/[id] — 单附件信息（异步提取后轮询状态） */
export async function getAgentAttachment(
  attachmentId: string,
): Promise<import("@/contracts/agent-attachment").AgentAttachmentInfo> {
  const res = await fetch(`/api/agent/attachments/${encodeURIComponent(attachmentId)}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "读取失败");
  }
  const body = (await res.json()) as { attachment: import("@/contracts/agent-attachment").AgentAttachmentInfo };
  return body.attachment;
}

/** 把附件固定到项目（跨会话可发现），成功返回更新后的附件信息 */
export async function postPinAttachment(
  attachmentId: string,
  projectId: string,
): Promise<{ attachment: import("@/contracts/agent-attachment").AgentAttachmentInfo }> {
  const res = await fetch(`/api/agent/attachments/${encodeURIComponent(attachmentId)}/pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "固定失败");
  }
  return (await res.json()) as { attachment: import("@/contracts/agent-attachment").AgentAttachmentInfo };
}
