import { describe, expect, it } from "vitest";
import {
  ruleText,
  rulesForKind,
} from "@/lib/agent/core/agent-rules";
import { buildAgentSystemPrompt } from "@/lib/agent/core/prompts";
import {
  citationApplyNudge,
  draftGoalNudge,
} from "@/lib/agent/core/goal-intents";
import { resultsWriteBlockMessage } from "@/lib/agent/data-foundation";
import { phaseGatePromptRules } from "@/lib/agent/core/phase-gates";

describe("AGENT_RULES SSOT", () => {
  it("prompt and draft nudge share draft-missing-refs text", () => {
    const text = ruleText("draft-missing-refs");
    expect(buildAgentSystemPrompt([], "draft")).toContain(text);
    expect(draftGoalNudge("写引言", "draft")).toContain(text);
  });

  it("prompt and citation nudge share citation-refine-writeback text", () => {
    const text = ruleText("citation-refine-writeback");
    expect(buildAgentSystemPrompt([], "citation_apply")).toContain(text);
    expect(citationApplyNudge()).toContain(text);
  });

  it("prompt and results hard-block share results-data-foundation text", () => {
    const text = ruleText("results-data-foundation");
    expect(buildAgentSystemPrompt([], "draft")).toContain(text);
    expect(resultsWriteBlockMessage()).toBe(text);
  });

  it("literature kind omits draft-missing-refs but keeps global blueprint rule", () => {
    const prompt = buildAgentSystemPrompt([], "literature");
    expect(prompt).toContain(ruleText("no-argument-blueprint"));
    expect(prompt).not.toContain(ruleText("draft-missing-refs"));
    expect(rulesForKind("literature").map((r) => r.id)).toEqual([
      "no-argument-blueprint",
    ]);
  });

  it("phase-gate prompt no longer duplicates the blueprint rule", () => {
    expect(phaseGatePromptRules()).not.toContain("build_argument_blueprint");
    expect(buildAgentSystemPrompt([], "draft")).toContain(
      ruleText("no-argument-blueprint"),
    );
  });

  it("review_write prompt includes subsection rule", () => {
    const text = ruleText("review-subsection");
    expect(buildAgentSystemPrompt([], "review_write")).toContain(text);
    expect(draftGoalNudge("写一篇生物炭综述", "review_write")).toContain(text);
  });
});
