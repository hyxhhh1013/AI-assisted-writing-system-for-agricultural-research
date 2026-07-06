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
