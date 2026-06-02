import { fetchWithRetry } from "./fetch-with-retry";
import { getModelConfig, ModelProviderKey, validateProviderKey } from "./models";
import { usageLog } from "./usage-log";
export { getAgentModelConfig } from "./models";

export interface AICallOptions {
  provider: ModelProviderKey;
  messages: { role: string; content: string }[];
  stream?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** 可选：调用者 userId，用于用量统计 */
  userId?: string;
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

// ==================== API Key 热加载 + 多 Key 轮转 ====================

let _keyCache: Record<string, string[]> | null = null;
let _keyCacheTime = 0;
let _keyRoundRobin = 0; // 轮转计数器
const KEY_CACHE_TTL = 30_000; // 30 秒

/** 收集所有可用的 API Key（DB + env），支持 DEEPSEEK_API_KEY, DEEPSEEK_API_KEY_2, ... */
async function getAllKeys(provider: ModelProviderKey): Promise<string[]> {
  const config = getModelConfig(provider);
  const baseKey = config.apiKeyEnvVar; // e.g. "DEEPSEEK_API_KEY"
  const keys: string[] = [];

  try {
    // 刷新缓存
    if (!_keyCache || Date.now() - _keyCacheTime > KEY_CACHE_TTL) {
      const { getAllSettings } = await import("./settings");
      const all = await getAllSettings(); // 读所有 DB 设置
      _keyCache = {};
      for (const { key, maskedValue: _masked } of all) {
        // maskedValue 是脱敏的，需要用 getSetting 读明文
      }
      // getAllSettings 返回脱敏值，改用逐个读取
      const { getSetting } = await import("./settings");
      const prefixes = ["DEEPSEEK_API_KEY", "ZHIPU_API_KEY"];
      _keyCache = {};
      for (const prefix of prefixes) {
        // 读 DEEPSEEK_API_KEY, DEEPSEEK_API_KEY_2, ...
        const collected: string[] = [];
        // 先读不带后缀的
        const v0 = await getSetting(prefix);
        if (v0) collected.push(v0);
        // 再读带后缀的
        for (let i = 2; i <= 10; i++) {
          const v = await getSetting(`${prefix}_${i}`);
          if (v) collected.push(v);
        }
        if (collected.length > 0) _keyCache[prefix] = collected;
      }
      _keyCacheTime = Date.now();
    }

    const cached = _keyCache[baseKey];
    if (cached && cached.length > 0) keys.push(...cached);
  } catch { /* DB 读取失败，回退到 env */ }

  // 从环境变量补充
  const envKey = config.getApiKey();
  if (envKey && !keys.includes(envKey)) {
    keys.unshift(envKey); // env key 优先
  }
  // 读取带后缀的环境变量
  for (let i = 2; i <= 10; i++) {
    const envKeyN = process.env[`${baseKey}_${i}`];
    if (envKeyN && !keys.includes(envKeyN)) keys.push(envKeyN);
  }

  return keys;
}

/** 轮转获取一个 API Key */
async function pickApiKey(provider: ModelProviderKey): Promise<string | undefined> {
  const keys = await getAllKeys(provider);
  if (keys.length === 0) return undefined;
  if (keys.length === 1) return keys[0];
  // 轮转：每次调用取下一个 key
  _keyRoundRobin++;
  return keys[_keyRoundRobin % keys.length];
}

export async function callAI(options: AICallOptions): Promise<Response> {
  const config = getModelConfig(options.provider);
  const apiKey = await pickApiKey(options.provider);

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

  try {
    usageLog.record(
      `ai:${options.provider}`,
      {
        provider: options.provider,
        model: config.model,
        messageCount: options.messages.length,
        stream: options.stream ?? true,
      },
      options.userId,
    );
  } catch {
    /* 用量统计失败不影响 AI 响应 */
  }

  return response;
}

/** 流式读取上游 AI 响应；idleTimeoutMs 为相邻 chunk 最大间隔（非总时长） */
export async function* streamAIResponse(
  response: Response,
  signal?: AbortSignal,
  idleTimeoutMs = 300_000,
): AsyncGenerator<{ content?: string }> {
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // 静默超时：如果 N 毫秒内没收到新 chunk，主动 cancel
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const clearIdle = () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } };
  const cancelReader = (reason: string) => {
    reader.cancel(reason)?.catch(() => {}); // 吞掉 rejection，防止 unhandledRejection
  };
  const resetIdle = () => {
    clearIdle();
    idleTimer = setTimeout(() => cancelReader("Stream idle timeout"), idleTimeoutMs);
  };

  // 如果外部信号触发，取消 reader
  const onExternalAbort = () => {
    clearIdle();
    cancelReader("Aborted");
  };
  if (signal) {
    if (signal.aborted) { cancelReader("Aborted"); return; }
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
