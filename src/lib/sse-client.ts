/** 泛型 SSE 流读取器 — 消除 4 处重复的 while(true) reader.read() 循环 */

export interface SSEEvent {
  [key: string]: unknown;
}

export interface SSEClientOptions {
  onEvent?: (event: SSEEvent) => void;
  onDone?: (fullText: string) => void;
  extractText?: (event: SSEEvent) => string | null;
}

/**
 * 从 Response ReadableStream 读取 SSE 事件。
 * 返回累积的完整文本。
 */
export async function readSSEStream(
  response: Response,
  options: SSEClientOptions = {},
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

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
        const event = JSON.parse(trimmed.slice(5).trim()) as SSEEvent;
        options.onEvent?.(event);

        const text = options.extractText?.(event) ?? null;
        if (text !== null) fullText += text;
      } catch {
        // 跳过格式异常的事件
      }
    }
  }

  options.onDone?.(fullText);
  return fullText;
}
