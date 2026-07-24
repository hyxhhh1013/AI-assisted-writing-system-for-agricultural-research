import { describe, expect, it } from "vitest";
import {
  formatAgentProjectBriefing,
  suggestNextAgentActions,
} from "@/lib/agent/project-briefing";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import { buildAgentSystemPrompt } from "@/lib/agent/core/prompts";

const sample: AgentProjectSnapshot = {
  title: "生物炭综述",
  mode: "review",
  language: "zh",
  template: "sci",
  citationStyle: "gbt7714",
  researchDirection: "生物炭",
  outline: "## 1 引言\n## 2 正文",
  references: ["[1] a", "[2] b"],
  dataClaims: [],
  currentPhase: 4,
  hasWritingBlueprint: true,
  hasArgumentBlueprint: false,
  sectionFills: [
    { key: "introduction", chars: 1200 },
    { key: "literature_body", chars: 0 },
    { key: "abstract", chars: 0 },
  ],
};

describe("agent project briefing", () => {
  it("formats snapshot into prompt briefing", () => {
    const text = formatAgentProjectBriefing(sample);
    expect(text).toContain("生物炭综述");
    expect(text).toContain("Passport 当前阶段：4");
    expect(text).toContain("introduction:1200字");
    expect(text).toContain("literature_body");
  });

  it("injects briefing into system prompt", () => {
    const prompt = buildAgentSystemPrompt([], formatAgentProjectBriefing(sample));
    expect(prompt).toContain("【当前项目简报】");
    expect(prompt).toContain("生物炭综述");
  });

  it("suggests write next empty section", () => {
    const tips = suggestNextAgentActions({
      currentPhase: 4,
      writeEnabled: true,
      hasOutline: true,
      hasArgumentBlueprint: false,
      emptySections: ["literature_body", "abstract"],
    });
    expect(tips.some((t) => t.includes("综述正文") || t.includes("论证"))).toBe(true);
  });
});
