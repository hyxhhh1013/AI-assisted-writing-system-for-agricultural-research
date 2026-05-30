import { fetchWithRetry } from "./fetch-with-retry";
import { getModelConfig, ModelProviderKey, validateProviderKey } from "./models";
export { getAgentModelConfig } from "./models";

export interface AICallOptions {
  provider: ModelProviderKey;
  messages: { role: string; content: string }[];
  stream?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class AIError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "AIError";
  }
}

export function getAIError(provider: ModelProviderKey): string | null {
  return validateProviderKey(provider);
}

export async function callAI(options: AICallOptions): Promise<Response> {
  const config = getModelConfig(options.provider);
  const apiKey = config.getApiKey();

  const keyError = validateProviderKey(options.provider);
  if (keyError) {
    throw new AIError(keyError);
  }

  if (!apiKey) {
    throw new AIError(`${config.name} API Key 未配置`);
  }

  const timeoutMs = options.timeoutMs ?? (options.stream ? 300_000 : 30_000);
  const response = await fetchWithRetry(
    config.baseUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: options.messages,
        stream: options.stream ?? true,
      }),
      signal: options.signal,
    },
    1,             // retries: 只重试 1 次（避免叠加等待过长）
    timeoutMs,
  );

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html") || response.status === 504 || response.status === 502 || response.status === 503) {
      throw new AIError(`AI 服务暂时繁忙（${response.status}），请稍后重试`, response.status);
    }
    let errorMsg = `${config.name} API 请求失败`;
    try {
      const err = await response.text();
      errorMsg = err.slice(0, 500);
    } catch {}
    throw new AIError(errorMsg, response.status);
  }

  return response;
}

export async function* streamAIResponse(
  response: Response,
  signal?: AbortSignal,
  idleTimeoutMs = 120_000,
): AsyncGenerator<{ content?: string }> {
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // 静默超时：如果 N 毫秒内没收到新 chunk，主动 abort
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const clearIdle = () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } };
  const resetIdle = () => {
    clearIdle();
    idleTimer = setTimeout(() => {
      reader.cancel("Stream idle timeout");
    }, idleTimeoutMs);
  };

  // 如果外部信号触发，取消 reader
  const onExternalAbort = () => {
    clearIdle();
    reader.cancel("Aborted");
  };
  if (signal) {
    if (signal.aborted) { reader.cancel("Aborted"); return; }
    signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    resetIdle();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdle();

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:") && trimmed !== "data: [DONE]") {
          try {
            const data = JSON.parse(trimmed.slice(5).trim());
            const content = data.choices?.[0]?.delta?.content
              || data.choices?.[0]?.delta?.reasoning_content
              || "";
            if (content) yield { content };
          } catch {}
        }
      }
    }

    // 处理 buffer 中残留的最后一行数据
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data:") && trimmed !== "data: [DONE]") {
        try {
          const data = JSON.parse(trimmed.slice(5).trim());
          const content = data.choices?.[0]?.delta?.content
            || data.choices?.[0]?.delta?.reasoning_content
            || "";
          if (content) yield { content };
        } catch {}
      }
    }
  } finally {
    clearIdle();
    if (signal) signal.removeEventListener("abort", onExternalAbort);
  }
}

/** 非流式 AI 调用 — 发送 prompt，等待完整回复后返回文本 */
export async function callAINonStreaming(options: AICallOptions): Promise<string> {
  const response = await callAI({ ...options, stream: false });
  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content || "";
  return content;
}

export function getStreamingResponse(response: Response): Response {
  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
