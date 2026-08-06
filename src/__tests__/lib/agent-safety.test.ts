import { describe, expect, it } from "vitest";
import {
  checkRepeatCall,
  clearBlockedReads,
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

  it("blocks repeated reads of the SAME section across different offsets (dead-loop guard)", () => {
    const tracker = createRepeatTracker();
    const allowed: boolean[] = [];
    for (let i = 0; i < COST_LIMITS.maxConsecutiveSameTool + 2; i++) {
      allowed.push(
        checkRepeatCall(tracker, "read_section", { section: "literature_body", offset: i * 1700 }).allowed,
      );
    }
    // 前 maxConsecutiveSameTool 次放行（允许正常分页），之后即使换 offset 也应拦截
    expect(allowed.slice(0, COST_LIMITS.maxConsecutiveSameTool).every(Boolean)).toBe(true);
    expect(allowed[COST_LIMITS.maxConsecutiveSameTool]).toBe(false);
  });

  it("reports repeatCount so callers can escalate soft warning to hard stop", () => {
    const tracker = createRepeatTracker();
    let last: { allowed: boolean; repeatCount: number } | null = null;
    for (let i = 0; i < 5; i++) {
      last = checkRepeatCall(tracker, "read_section", { section: "s", offset: i });
    }
    expect(last?.repeatCount).toBe(5);
  });

  it("read_section 同章节连续阻断后进入隔离：穿插其他工具仍持续阻断", () => {
    const tracker = createRepeatTracker();
    const p = { section: "literature_body", offset: 0 };
    for (let i = 0; i < COST_LIMITS.maxConsecutiveSameTool; i++) {
      expect(checkRepeatCall(tracker, "read_section", p).allowed).toBe(true);
    }
    const blocked = checkRepeatCall(tracker, "read_section", p);
    expect(blocked.allowed).toBe(false);

    // 隔离持久：调用其他工具后再读同章节仍被阻断（死循环防御）
    checkRepeatCall(tracker, "read_project_asset", { asset: "outline" });
    const again = checkRepeatCall(tracker, "read_section", p);
    expect(again.allowed).toBe(false);
    expect(again.warning).toMatch(/隔离/);
  });

  it("clearBlockedReads 在写进展后放行被隔离章节", () => {
    const tracker = createRepeatTracker();
    const p = { section: "literature_body" };
    for (let i = 0; i <= COST_LIMITS.maxConsecutiveSameTool; i++) {
      checkRepeatCall(tracker, "read_section", p);
    }
    expect(checkRepeatCall(tracker, "read_section", p).allowed).toBe(false);
    clearBlockedReads(tracker);
    expect(checkRepeatCall(tracker, "read_section", p).allowed).toBe(true);
  });

  it("其他章节不受隔离影响", () => {
    const tracker = createRepeatTracker();
    const a = { section: "introduction" };
    for (let i = 0; i <= COST_LIMITS.maxConsecutiveSameTool; i++) {
      checkRepeatCall(tracker, "read_section", a);
    }
    expect(checkRepeatCall(tracker, "read_section", a).allowed).toBe(false);
    expect(checkRepeatCall(tracker, "read_section", { section: "background" }).allowed).toBe(true);
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
