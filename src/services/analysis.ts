/** POST /api/analysis — 实验数据 AI 趋势描述（SSE） */

import { readSSEStream, extractAIDeltaContent } from "@/lib/sse-client";

export async function streamDataAnalysis(
  dataSummary: string,
  researchDirection: string,
  onChunk: (text: string) => void,
): Promise<string> {
  const response = await fetch("/api/analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataSummary, researchDirection }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "分析失败");
  }

  let fullResult = "";
  return readSSEStream(response, {
    extractText: extractAIDeltaContent,
    onEvent: (event) => {
      const content = extractAIDeltaContent(event);
      if (content) {
        fullResult += content;
        onChunk(fullResult);
      }
    },
  });
}
