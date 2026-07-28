import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt } from "@/lib/agent/core/prompts";
import { inspectProjectTool } from "@/lib/agent/tools/inspect-project";
import { readSectionTool } from "@/lib/agent/tools/read-section";

describe("agentic conversational posture", () => {
  it("system prompt emphasizes dialogue and self-context", () => {
    const prompt = buildAgentSystemPrompt([inspectProjectTool, readSectionTool]);
    expect(prompt).toContain("不是无人流水线");
    expect(prompt).toContain("inspect_project");
    expect(prompt).toContain("对话推进");
    expect(prompt).not.toContain("一口气做完");
  });

  it("registers inspect and read as read tools", () => {
    expect(inspectProjectTool.safety).toBe("read");
    expect(readSectionTool.safety).toBe("read");
    expect(inspectProjectTool.name).toBe("inspect_project");
    expect(readSectionTool.name).toBe("read_section");
  });
});
