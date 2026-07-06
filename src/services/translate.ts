/** POST /api/translate — 翻译 SSE 流 */

import type { TranslateInput } from "@/lib/validations";
import { readSSEStream, extractAIDeltaContent } from "@/lib/sse-client";

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

  let full = "";
  return readSSEStream(res, {
    extractText: extractAIDeltaContent,
    onEvent: (event) => {
      const content = extractAIDeltaContent(event);
      if (content) {
        full += content;
        onChunk(full);
      }
    },
  });
}
