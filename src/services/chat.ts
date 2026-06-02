/** POST /api/chat — 文献对话 SSE */

import type { ChatInput } from "@/lib/validations";

export async function streamChat(
  input: ChatInput,
  onChunk: (assistantText: string) => void,
): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "请求失败");
  }

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  if (!reader) throw new Error("无法读取对话流");

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
        const data = JSON.parse(trimmed.slice(5).trim()) as {
          choices?: { delta?: { content?: string } }[];
        };
        full += data.choices?.[0]?.delta?.content || "";
        onChunk(full);
      } catch {
        /* ignore malformed SSE */
      }
    }
  }
  return full;
}
