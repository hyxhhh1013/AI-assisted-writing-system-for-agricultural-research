/** POST /api/translate — 翻译 SSE 流 */

import type { TranslateInput } from "@/lib/validations";

export async function streamTranslate(
  input: TranslateInput,
  onChunk: (text: string) => void,
): Promise<string> {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "翻译失败");
  }

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  if (!reader) throw new Error("无法读取翻译流");

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
        const content = data.choices?.[0]?.delta?.content || "";
        full += content;
        onChunk(full);
      } catch {
        /* ignore malformed SSE */
      }
    }
  }
  return full;
}
