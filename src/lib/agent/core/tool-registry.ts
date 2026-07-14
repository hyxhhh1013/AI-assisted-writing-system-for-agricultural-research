import type { ToolDefinition } from "@/lib/agent/types";

export function registerTools(tools: ToolDefinition[]): ToolDefinition[] {
  const names = new Set<string>();
  for (const tool of tools) {
    if (names.has(tool.name)) {
      throw new Error(`Duplicate tool name: ${tool.name}`);
    }
    names.add(tool.name);
  }
  return tools;
}

export function toolsToOpenAISchema(tools: ToolDefinition[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function toolsDescriptionText(tools: ToolDefinition[]): string {
  return tools
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n");
}

export function findTool(
  tools: ToolDefinition[],
  name: string,
): ToolDefinition | undefined {
  return tools.find((t) => t.name === name);
}

export function parseToolArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  return {};
}
