import { describe, expect, it } from "vitest";
import { parsePromptBasedToolCalls } from "@/lib/agent/core/prompt-tools";
import {
  parseToolArgs,
  registerTools,
  toolsToOpenAISchema,
} from "@/lib/agent/core/tool-registry";
import { searchKnowledgeTool } from "@/lib/agent/tools/search-knowledge";

describe("parsePromptBasedToolCalls", () => {
  it("parses tool_call fenced blocks", () => {
    const content = `我将检索文献。\n\`\`\`tool_call\n{"name":"search_knowledge","params":{"query":"biochar"}}\n\`\`\``;
    const calls = parsePromptBasedToolCalls(content);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("search_knowledge");
    expect(calls[0].args).toEqual({ query: "biochar" });
  });
});

describe("tool-registry", () => {
  it("registers unique tool names", () => {
    expect(() => registerTools([searchKnowledgeTool, searchKnowledgeTool])).toThrow(
      /Duplicate tool name/,
    );
  });

  it("converts tools to OpenAI schema", () => {
    const schema = toolsToOpenAISchema([searchKnowledgeTool]);
    expect(schema[0].function.name).toBe("search_knowledge");
  });

  it("parseToolArgs handles string JSON", () => {
    expect(parseToolArgs('{"query":"test"}')).toEqual({ query: "test" });
  });
});
