import { describe, expect, it } from "vitest";
import { findFigureBlocks } from "@/hooks/use-figure-pipeline";

const SAMPLE_FLOW =
  '【FIGURE:{"tool":"flow","config":{"title":"流程","direction":"vertical","nodes":[{"id":"1","label":"步骤1"}],"edges":[]},"caption":"图2 实验流程"}】';

const SAMPLE_CHART =
  '【FIGURE: {"tool":"chart","config":{"type":"bar","data":{"labels":["A","B"],"datasets":[{"label":"产量","data":[10,20]}]}},"caption":"图3 产量对比"}】';

describe("findFigureBlocks", () => {
  it("parses standard Chinese FIGURE markers", () => {
    const blocks = findFigureBlocks(`段落\n\n${SAMPLE_FLOW}\n\n结尾`);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.json.tool).toBe("flow");
    expect(blocks[0]?.json.caption).toBe("图2 实验流程");
  });

  it("allows whitespace after colon", () => {
    const blocks = findFigureBlocks(SAMPLE_CHART);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.json.tool).toBe("chart");
  });

  it("parses bracket-style markers", () => {
    const text =
      '[FIGURE:{"tool":"flow","config":{"title":"T","nodes":[{"id":"1","label":"a"}],"edges":[]},"caption":"图1 示意"}]';
    const blocks = findFigureBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.raw.endsWith("]")).toBe(true);
  });

  it("handles braces inside JSON string values", () => {
    const text =
      '【FIGURE:{"tool":"flow","config":{"title":"A}B","nodes":[{"id":"1","label":"x"}],"edges":[]},"caption":"图4 测试"}】';
    const blocks = findFigureBlocks(text);
    expect(blocks).toHaveLength(1);
    expect((blocks[0]?.json.config as { title?: string }).title).toBe("A}B");
  });
});
