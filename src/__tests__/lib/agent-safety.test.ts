import { describe, expect, it } from "vitest";
import {
  checkRepeatCall,
  createRepeatTracker,
  COST_LIMITS,
  isAgentWriteEnabled,
  isAgentWritePublicEnabled,
} from "@/lib/agent/core/safety";
import { createAgentTools, createReadOnlyTools } from "@/lib/agent/core/agent-loop";

describe("agent safety", () => {
  it("blocks identical consecutive tool calls beyond limit", () => {
    const tracker = createRepeatTracker();
    const params = { query: "biochar" };

    for (let i = 0; i < COST_LIMITS.maxConsecutiveSameTool; i++) {
      const result = checkRepeatCall(tracker, "search_knowledge", params);
      expect(result.allowed).toBe(true);
    }

    const blocked = checkRepeatCall(tracker, "search_knowledge", params);
    expect(blocked.allowed).toBe(false);
    expect(blocked.warning).toMatch(/连续调用/);
  });

  it("resets repeat counter when params change", () => {
    const tracker = createRepeatTracker();
    checkRepeatCall(tracker, "search_knowledge", { query: "a" });
    checkRepeatCall(tracker, "search_knowledge", { query: "b" });
    const again = checkRepeatCall(tracker, "search_knowledge", { query: "b" });
    expect(again.allowed).toBe(true);
  });

  it("isAgentWriteEnabled requires AGENT_ENABLED and AGENT_WRITE_ENABLED", () => {
    const prevAgent = process.env.AGENT_ENABLED;
    const prevWrite = process.env.AGENT_WRITE_ENABLED;
    process.env.AGENT_ENABLED = "1";
    process.env.AGENT_WRITE_ENABLED = "1";
    expect(isAgentWriteEnabled()).toBe(true);
    process.env.AGENT_WRITE_ENABLED = "0";
    expect(isAgentWriteEnabled()).toBe(false);
    process.env.AGENT_ENABLED = prevAgent;
    process.env.AGENT_WRITE_ENABLED = prevWrite;
  });

  it("isAgentWritePublicEnabled requires public agent + write flags", () => {
    const prevPublic = process.env.NEXT_PUBLIC_AGENT_ENABLED;
    const prevWrite = process.env.NEXT_PUBLIC_AGENT_WRITE_ENABLED;
    process.env.NEXT_PUBLIC_AGENT_ENABLED = "1";
    process.env.NEXT_PUBLIC_AGENT_WRITE_ENABLED = "1";
    expect(isAgentWritePublicEnabled()).toBe(true);
    process.env.NEXT_PUBLIC_AGENT_WRITE_ENABLED = "0";
    expect(isAgentWritePublicEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_AGENT_ENABLED = prevPublic;
    process.env.NEXT_PUBLIC_AGENT_WRITE_ENABLED = prevWrite;
  });

  it("createAgentTools adds write_section only when write flag on", () => {
    const prevAgent = process.env.AGENT_ENABLED;
    const prevWrite = process.env.AGENT_WRITE_ENABLED;
    process.env.AGENT_ENABLED = "1";
    process.env.AGENT_WRITE_ENABLED = "0";
    expect(createAgentTools().map((t) => t.name)).not.toContain("write_section");
    expect(createAgentTools().length).toBe(createReadOnlyTools().length);
    expect(createReadOnlyTools().map((t) => t.name)).toContain("check_plagiarism");
    expect(createReadOnlyTools().map((t) => t.name)).toContain("run_review_rounds");
    process.env.AGENT_WRITE_ENABLED = "1";
    const names = createAgentTools().map((t) => t.name);
    expect(names).toContain("write_section");
    expect(names).toContain("refine_content");
    expect(names).toContain("import_reference");
    expect(names).toContain("generate_chart");
    expect(names).toContain("build_argument_blueprint");
    expect(names).toContain("write_bilingual_abstract");
    process.env.AGENT_ENABLED = prevAgent;
    process.env.AGENT_WRITE_ENABLED = prevWrite;
  });
});
