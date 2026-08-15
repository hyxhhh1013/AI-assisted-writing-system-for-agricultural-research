import { describe, expect, it, vi } from "vitest";
import { BAD_PAPER, GOOD_PAPER } from "@/lib/quality-eval/fixtures";
import {
  evaluateQualityLlm,
  formatPaperForJudge,
  parseQualityLlmJson,
} from "@/lib/quality-eval/llm-judge";
import type { QualityPaperJudge } from "@/lib/quality-eval/types";
import { readFileSync } from "fs";
import path from "path";

const VALID_JSON = JSON.stringify({
  citation_support: { score: 90, comment: "编号与摘要相符" },
  data_conclusion: { score: 80, comment: "结论回扣了产率" },
  overclaim: { score: 70, comment: "有待田间验证" },
  coherence: { score: 85, comment: "方法结果讨论衔接" },
});

describe("quality-eval LLM-judge", () => {
  it("parses a valid JSON object and averages scores", () => {
    const r = parseQualityLlmJson(`前言\n${VALID_JSON}\n后记`);
    expect(r.skipped).toBe(false);
    expect(r.overallScore).toBe(81);
    expect(r.dimensions.map((d) => d.key)).toEqual([
      "citation_support",
      "data_conclusion",
      "overclaim",
      "coherence",
    ]);
    expect(r.dimensions[0].score).toBe(90);
  });

  it("skips on malformed output", () => {
    const r = parseQualityLlmJson("garbage without json");
    expect(r.skipped).toBe(true);
    expect(r.dimensions).toEqual([]);
  });

  it("clamps unknown scores to 0-100", () => {
    const r = parseQualityLlmJson(
      '{"citation_support":{"score":150},"data_conclusion":{"score":-3},"overclaim":{"score":"x"},"coherence":{"score":40}}',
    );
    expect(r.skipped).toBe(false);
    expect(r.dimensions.map((d) => d.score)).toEqual([100, 0, 0, 40]);
  });

  it("fake judge ranks GOOD_PAPER above BAD_PAPER", async () => {
    const judge: QualityPaperJudge = async (input) => {
      const goodish = (input.title ?? "").includes("热解");
      return {
        dimensions: [],
        overallScore: goodish ? 86 : 32,
        skipped: false,
      };
    };
    const good = await evaluateQualityLlm(GOOD_PAPER, judge);
    const bad = await evaluateQualityLlm(BAD_PAPER, judge);
    expect(good.skipped).toBe(false);
    expect(bad.skipped).toBe(false);
    expect(good.overallScore).toBeGreaterThan(bad.overallScore);
  });

  it("throws from judge become skipped (no key / timeout)", async () => {
    const judge = vi.fn(async () => {
      throw new Error("智谱AI API Key 未配置");
    });
    const r = await evaluateQualityLlm(GOOD_PAPER, judge);
    expect(r.skipped).toBe(true);
    expect(r.skipReason).toMatch(/未配置/);
  });

  it("formats paper with title and clipped sections", () => {
    const text = formatPaperForJudge(GOOD_PAPER);
    expect(text).toContain("耐盐碱水稻秸秆");
    expect(text).toContain("[1]");
  });

  it("is not imported from write_section or toolsNode", () => {
    const root = path.resolve(__dirname, "../../..");
    const nodes = readFileSync(
      path.join(root, "src/lib/agent/langgraph/nodes.ts"),
      "utf8",
    );
    const write = readFileSync(
      path.join(root, "src/lib/agent/tools/write-section.ts"),
      "utf8",
    );
    expect(nodes).not.toContain("quality-eval/llm-judge");
    expect(write).not.toContain("quality-eval/llm-judge");
  });
});
