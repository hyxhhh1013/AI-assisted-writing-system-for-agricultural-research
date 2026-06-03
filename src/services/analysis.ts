/** POST /api/analysis — 实验数据 AI 趋势描述（SSE） */

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

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullResult = "";

  if (!reader) {
    throw new Error("无法读取分析流");
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim().startsWith("data:")) continue;
      try {
        const data = JSON.parse(line.trim().slice(5).trim()) as {
          choices?: { delta?: { content?: string } }[];
        };
        const content = data.choices?.[0]?.delta?.content || "";
        if (content) {
          fullResult += content;
          onChunk(fullResult);
        }
      } catch {
        /* ignore malformed SSE chunks */
      }
    }
  }

  return fullResult;
}
