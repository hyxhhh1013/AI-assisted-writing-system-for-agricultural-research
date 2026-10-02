import { describe, expect, it } from "vitest";
import {
  formatAgentProjectBriefing,
  suggestNextAgentActions,
} from "@/lib/agent/project-briefing";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import {
  buildAgentBriefingMessage,
  buildAgentSystemPrompt,
} from "@/lib/agent/core/prompts";

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
  blueprintWritingOrder: ["研究现状与问题", "引言", "结论与展望", "摘要"],
  blueprintSectionGuides: [
    { path: "引言", purpose: "建立研究背景与核心命题" },
    { path: "研究现状与问题", purpose: "梳理基础共识与现存瓶颈" },
  ],
    nextWriteHint: {
      sectionKey: "literature_body",
      subsectionPath: "研究进展综述 > 改性策略",
    },
    hasArgumentBlueprint: false,
  sectionFills: [
    { key: "introduction", chars: 1200 },
    { key: "literature_body", chars: 0 },
    { key: "abstract", chars: 0 },
  ],
  hasPaperConfig: true,
};

describe("agent project briefing", () => {
  it("formats snapshot into prompt briefing", () => {
    const text = formatAgentProjectBriefing(sample);
    expect(text).toContain("生物炭综述");
    expect(text).toContain("PaperConfig：已填写");
    expect(text).toContain("目标字数：（未填）");
    expect(text).toContain("introduction:1200字");
    expect(text).toContain("literature_body");
    expect(text).toContain("分节完整度");
    expect(text).toContain("大纲全文");
    expect(text).toContain("证据声明：0 条");
    expect(text).toContain("ingest");
    expect(text).toContain("实验室范围");
    expect(text).toContain("热化学");
    expect(text).toContain("烟草");
    expect(text).toContain("只允许：热化学");
    expect(text).toContain("禁止规划「按实验室四方向检索」");
    expect(text).toContain("下一未写子节");
    expect(text).toContain("write_section(section=literature_body");
  });

  it("injects blueprint writing order and section guides", () => {
    const text = formatAgentProjectBriefing(sample);
    expect(text).toContain("建议写作顺序（蓝图）：1. 研究现状与问题 → 2. 引言 → 3. 结论与展望 → 4. 摘要");
    expect(text).toContain("各节写作要点（蓝图");
    expect(text).toContain("- 引言：建立研究背景与核心命题");
  });

  it("omits blueprint order block when no writingOrder", () => {
    const noOrder = { ...sample, blueprintWritingOrder: undefined, blueprintSectionGuides: undefined };
    const text = formatAgentProjectBriefing(noOrder);
    expect(text).not.toContain("建议写作顺序");
    expect(text).not.toContain("各节写作要点");
  });

  it("briefing 经独立 user 消息注入，system prompt 前缀稳定", () => {
    const msg = buildAgentBriefingMessage(formatAgentProjectBriefing(sample));
    expect(msg).not.toBeNull();
    expect(msg!.content).toContain("【项目简报");
    expect(msg!.content).toContain("生物炭综述");
    expect(msg!.content).toContain("只允许：热化学");
    // system prompt 不再内嵌易变的项目简报
    const prompt = buildAgentSystemPrompt([]);
    expect(prompt).not.toContain("【项目简报");
  });

  it("suggests write next empty section", () => {
    const tips = suggestNextAgentActions({
      currentPhase: 4,
      writeEnabled: true,
      hasOutline: true,
      hasWritingBlueprint: true,
      emptySections: ["literature_body", "abstract"],
      nextSectionKey: "literature_body",
      thinOrGapSections: ["literature_body"],
    });
    expect(tips).toHaveLength(1);
    expect(tips[0]).toContain("综述正文");
  });

  it("does not stack literature search with write-section at phase 1", () => {
    const tips = suggestNextAgentActions({
      currentPhase: 1,
      writeEnabled: true,
      hasOutline: false,
      hasWritingBlueprint: false,
      emptySections: ["introduction", "literature_body"],
      nextSectionKey: "introduction",
    });
    expect(tips).toEqual(["按本题检索并导入相关文献"]);
    expect(tips.some((t) => t.startsWith("写"))).toBe(false);
  });

  it("does not keep hunting literature when refs already exist but outline is missing", () => {
    const tips = suggestNextAgentActions({
      currentPhase: 1,
      writeEnabled: true,
      hasOutline: false,
      hasWritingBlueprint: false,
      emptySections: ["introduction"],
      referenceCount: 12,
    });
    expect(tips[0]).toContain("大纲");
    expect(tips.some((t) => t.includes("检索"))).toBe(false);
  });

  it("skips stale phase-1 literature tip once an outline exists", () => {
    const tips = suggestNextAgentActions({
      currentPhase: 1,
      writeEnabled: true,
      hasOutline: true,
      hasWritingBlueprint: false,
      emptySections: ["introduction"],
    });
    expect(tips).toHaveLength(1);
    expect(tips[0]).toContain("写作蓝图");
    expect(tips.some((t) => t.includes("检索"))).toBe(false);
    expect(tips.some((t) => t.startsWith("写"))).toBe(false);
  });

  it("suggests thickening a thin section", () => {
    const tips = suggestNextAgentActions({
      currentPhase: 4,
      writeEnabled: true,
      hasOutline: true,
      hasWritingBlueprint: true,
      emptySections: [],
      nextSectionKey: "introduction",
      thinOrGapSections: ["introduction"],
    });
    expect(tips.some((t) => t.includes("引言") && t.includes("偏薄"))).toBe(true);
  });

  it("prefers thickening a thin section over passport citation phase", () => {
    const tips = suggestNextAgentActions({
      currentPhase: 5,
      writeEnabled: true,
      hasOutline: true,
      hasWritingBlueprint: true,
      emptySections: [],
      nextSectionKey: "literature_body",
      thinOrGapSections: ["literature_body"],
    });
    expect(tips[0]).toContain("综述正文");
    expect(tips.some((t) => t.includes("引用"))).toBe(false);
  });
});
