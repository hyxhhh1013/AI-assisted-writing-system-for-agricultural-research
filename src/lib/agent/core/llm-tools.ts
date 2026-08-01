import { callAI, getAgentModelConfig } from "@/lib/ai";
import type { AIToolSchema } from "@/lib/ai";
import type { LLMMessage, LLMWithToolsResponse, ParsedToolCall } from "@/lib/agent/types";
import { parsePromptBasedToolCalls } from "@/lib/agent/core/prompt-tools";

export interface CallWithToolsOptions {
  messages: LLMMessage[];
  tools?: AIToolSchema[];
  toolChoice?: "auto" | "none" | "required";
  signal?: AbortSignal;
  userId?: string;
  temperature?: number;
  useNativeTools?: boolean;
}

export async function callAINonStreamingWithTools(
  options: CallWithToolsOptions,
): Promise<LLMWithToolsResponse> {
  const { provider } = getAgentModelConfig("writer");
  const useNative = options.useNativeTools !== false && (options.tools?.length ?? 0) > 0;

  if (useNative && options.tools) {
    const native = await callNativeWithTools(provider, options);
    if (native.toolCalls.length > 0 || native.finishReason === "stop") {
      return native;
    }
  }

  const augmentedMessages = options.tools?.length
    ? injectPromptTools(options.messages, options.tools)
    : options.messages;

  const response = await callAI({
    provider,
    messages: augmentedMessages,
    stream: false,
    signal: options.signal,
    userId: options.userId,
    temperature: options.temperature,
  });

  const body = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string | null; tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }> };
      finish_reason?: string;
    }>;
  };

  const choice = body.choices?.[0];
  const content = choice?.message?.content ?? null;
  const nativeCalls = choice?.message?.tool_calls ?? [];

  if (nativeCalls.length > 0) {
    return {
      content,
      toolCalls: nativeCalls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        args: safeParseArgs(tc.function.arguments),
      })),
      finishReason: "tool_calls",
    };
  }

  const promptCalls = parsePromptBasedToolCalls(content ?? "");
  if (promptCalls.length > 0) {
    return { content, toolCalls: promptCalls, finishReason: "tool_calls" };
  }

  return {
    content,
    toolCalls: [],
    finishReason: choice?.finish_reason === "stop" ? "stop" : "unknown",
  };
}

/**
 * 流式调用（真流式）：逐 token 推内容增量，末尾识别工具调用（原生 tool_calls 或提示式）。
 * onDelta 收到每个内容增量，可经实时 SSE 通道直接推给前端。
 */
export async function callAIStreamingWithTools(
  options: CallWithToolsOptions,
  onDelta?: (content: string) => void,
): Promise<LLMWithToolsResponse> {
  const { provider } = getAgentModelConfig("writer");
  const useNative = options.useNativeTools !== false && (options.tools?.length ?? 0) > 0;
  const messages = useNative
    ? options.messages
    : injectPromptTools(options.messages, options.tools ?? []);

  const response = await callAI({
    provider,
    messages,
    stream: true,
    signal: options.signal,
    userId: options.userId,
    temperature: options.temperature,
    ...(useNative && options.tools?.length
      ? { tools: options.tools, tool_choice: options.toolChoice ?? "auto" }
      : {}),
  });

  const reader = response.body?.getReader();
  if (!reader) throw new Error("AI 流式响应不可用");

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  const toolCalls: Array<{ index: number; id: string; name: string; args: string }> = [];

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:") || trimmed === "data: [DONE]") return;
    try {
      const data = JSON.parse(trimmed.slice(5).trim()) as {
        choices?: Array<{ delta?: Record<string, unknown> }>;
      };
      const delta = (data.choices?.[0]?.delta ?? {}) as Record<string, unknown>;
      const content =
        typeof delta.content === "string"
          ? delta.content
          : typeof delta.reasoning_content === "string"
            ? delta.reasoning_content
            : "";
      if (content) {
        fullContent += content;
        onDelta?.(content);
      }
      const tcs = delta.tool_calls;
      if (Array.isArray(tcs)) {
        for (const tc of tcs) {
          if (!tc || typeof tc !== "object") continue;
          const o = tc as { index?: unknown; id?: unknown; function?: { name?: unknown; arguments?: unknown } };
          const idx = typeof o.index === "number" ? o.index : 0;
          const cur = toolCalls[idx] ?? { index: idx, id: "", name: "", args: "" };
          if (typeof o.id === "string") cur.id += o.id;
          if (typeof o.function?.name === "string") cur.name += o.function.name;
          if (typeof o.function?.arguments === "string") cur.args += o.function.arguments;
          toolCalls[idx] = cur;
        }
      }
    } catch {
      /* 忽略单行解析失败 */
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) handleLine(line);
    }
    if (buffer.trim()) handleLine(buffer);
  } finally {
    reader.releaseLock?.();
  }

  if (toolCalls.length > 0) {
    return {
      content: fullContent || null,
      toolCalls: toolCalls.map((t) => ({
        id: t.id,
        name: t.name,
        args: safeParseArgs(t.args),
      })),
      finishReason: "tool_calls",
    };
  }

  const promptCalls = parsePromptBasedToolCalls(fullContent);
  if (promptCalls.length > 0) {
    return { content: fullContent, toolCalls: promptCalls, finishReason: "tool_calls" };
  }

  return {
    content: fullContent || null,
    toolCalls: [],
    finishReason: fullContent ? "stop" : "unknown",
  };
}

async function callNativeWithTools(
  provider: "deepseek" | "zhipu",
  options: CallWithToolsOptions,
): Promise<LLMWithToolsResponse> {
  const response = await callAI({
    provider,
    messages: options.messages,
    stream: false,
    signal: options.signal,
    userId: options.userId,
    temperature: options.temperature,
    tools: options.tools,
    tool_choice: options.toolChoice ?? "auto",
  });

  const body = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id: string;
          function: { name: string; arguments: string };
        }>;
      };
      finish_reason?: string;
    }>;
  };

  const choice = body.choices?.[0];
  const toolCalls = (choice?.message?.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    args: safeParseArgs(tc.function.arguments),
  }));

  return {
    content: choice?.message?.content ?? null,
    toolCalls,
    finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
  };
}

function injectPromptTools(messages: LLMMessage[], tools: AIToolSchema[]): LLMMessage[] {
  const toolDoc = tools
    .map((t) => {
      const fn = t.function;
      return `### ${fn.name}\n${fn.description}\nParameters: ${JSON.stringify(fn.parameters)}`;
    })
    .join("\n\n");

  const instruction = `可用工具：\n${toolDoc}\n\n如需调用工具，在回复末尾输出：\n\`\`\`tool_call\n{"name":"工具名","params":{...}}\n\`\`\``;

  const cloned = [...messages];
  const systemIdx = cloned.findIndex((m) => m.role === "system");
  if (systemIdx >= 0) {
    cloned[systemIdx] = {
      ...cloned[systemIdx],
      content: `${cloned[systemIdx].content}\n\n${instruction}`,
    };
  } else {
    cloned.unshift({ role: "system", content: instruction });
  }
  return cloned;
}

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
