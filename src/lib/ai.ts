import { fetchWithRetry } from "./fetch-with-retry";
import { getModelConfig, ModelProviderKey, validateProviderKey } from "./models";
export { getAgentModelConfig } from "./models";

export interface AICallOptions {
  provider: ModelProviderKey;
  messages: { role: string; content: string }[];
  stream?: boolean;
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
    },
  );

  if (!response.ok) {
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
): AsyncGenerator<{ content?: string }> {
  if (!response.body) return;

  const reader = response.body.getReader();
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
      if (trimmed.startsWith("data:") && trimmed !== "data: [DONE]") {
        try {
          const data = JSON.parse(trimmed.slice(5).trim());
          const content = data.choices?.[0]?.delta?.content || "";
          if (content) yield { content };
        } catch {}
      }
    }
  }
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
