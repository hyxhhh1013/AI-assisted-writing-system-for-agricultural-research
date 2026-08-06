import { describe, expect, it } from "vitest";
import { parseChartIndices } from "@/lib/agent/tools/generate-chart";

describe("parseChartIndices（chartIndices 批量 + chartIndex 兜底）", () => {
  it("字符串 JSON 数组 → 数字数组", () => {
    expect(parseChartIndices({ chartIndices: "[0,1,2]" })).toEqual([0, 1, 2]);
  });

  it("英文逗号分隔字符串", () => {
    expect(parseChartIndices({ chartIndices: "0,1,2" })).toEqual([0, 1, 2]);
  });

  it("中文逗号 / 空格分隔字符串", () => {
    expect(parseChartIndices({ chartIndices: "0，1，2" })).toEqual([0, 1, 2]);
    expect(parseChartIndices({ chartIndices: "0 1 2" })).toEqual([0, 1, 2]);
  });

  it("JSON 数组字符串含空白也能解析", () => {
    expect(parseChartIndices({ chartIndices: "[0, 1, 2]" })).toEqual([0, 1, 2]);
  });

  it("真实数组 → 去重 + 截断小数", () => {
    expect(parseChartIndices({ chartIndices: [0, 0, 1, 2, 2] })).toEqual([0, 1, 2]);
    expect(parseChartIndices({ chartIndices: [0, 1.9] })).toEqual([0, 1]);
  });

  it("非法项被过滤（非数字 / null / 空串 / 布尔）", () => {
    expect(parseChartIndices({ chartIndices: "0,a,2" })).toEqual([0, 2]);
    expect(parseChartIndices({ chartIndices: ["x", 1, null, ""] })).toEqual([1]);
    expect(parseChartIndices({ chartIndices: [0, false, 2] })).toEqual([0, 2]);
  });

  it("缺失 / 空 chartIndices 返回空数组", () => {
    expect(parseChartIndices({})).toEqual([]);
    expect(parseChartIndices({ chartIndices: "" })).toEqual([]);
  });

  it("chartIndex 单图兜底：仅当 chartIndices 为空时生效", () => {
    expect(parseChartIndices({ chartIndex: 3 })).toEqual([3]);
    // chartIndices 非空时优先，chartIndex 不并入
    expect(parseChartIndices({ chartIndices: [1], chartIndex: 5 })).toEqual([1]);
    // chartIndices 为空串时回退 chartIndex
    expect(parseChartIndices({ chartIndices: "", chartIndex: 5 })).toEqual([5]);
  });
});
