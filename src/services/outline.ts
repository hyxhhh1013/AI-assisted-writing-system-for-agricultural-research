/** POST /api/outline — 大纲 SSE 流 */

import type { OutlineInput } from "@/lib/validations";

export async function streamOutline(
  input: OutlineInput,
  onChunk: (text: string) => void,
): Promise<string> {
  const res = await fetch("/api/outline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("生成失败");

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  if (!reader) throw new Error("无法读取大纲流");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t || t === "data: [DONE]") continue;
      if (!t.startsWith("data:")) continue;
      try {
        const d = JSON.parse(t.slice(5).trim()) as {
          choices?: { delta?: { content?: string } }[];
        };
        full += d.choices?.[0]?.delta?.content || "";
        onChunk(full);
      } catch {
        /* ignore malformed SSE */
      }
    }
  }
  return full;
}
