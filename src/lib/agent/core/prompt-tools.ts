import type { ParsedToolCall } from "@/lib/agent/types";

const TOOL_CALL_RE = /```tool_call\s*\n([\s\S]*?)\n```/g;

export function parsePromptBasedToolCalls(content: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = TOOL_CALL_RE.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim()) as {
        name?: string;
        params?: Record<string, unknown>;
      };
      if (!parsed.name) continue;
      calls.push({
        id: `prompt_call_${index++}`,
        name: parsed.name,
        args: parsed.params ?? {},
      });
    } catch {
      /* skip malformed block */
    }
  }

  return calls;
}
