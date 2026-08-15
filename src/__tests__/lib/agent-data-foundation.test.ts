import { describe, expect, it } from "vitest";
import {
  assessDataFoundation,
  resultsWriteBlockMessage,
  shouldBlockResultsWrite,
} from "@/lib/agent/data-foundation";

describe("assessDataFoundation", () => {
  it("全空为 empty", () => {
    const f = assessDataFoundation({ claimCount: 0, sourceCount: 0, candidateCount: 0 });
    expect(f.status).toBe("empty");
    expect(f.brief).toMatch(/无/);
  });

  it("只有声明为 claims_only", () => {
    const f = assessDataFoundation({ claimCount: 3, sourceCount: 0, candidateCount: 0 });
    expect(f.status).toBe("claims_only");
    expect(f.brief).toMatch(/3 条/);
  });

  it("有表或候选为 tabular", () => {
    expect(
      assessDataFoundation({ claimCount: 0, sourceCount: 1, candidateCount: 0 }).status,
    ).toBe("tabular");
    expect(
      assessDataFoundation({ claimCount: 2, sourceCount: 0, candidateCount: 1 }).status,
    ).toBe("tabular");
  });

  it("仪器源优先于 tabular", () => {
    const f = assessDataFoundation({
      claimCount: 1,
      sourceCount: 1,
      candidateCount: 1,
      instrumentSourceCount: 2,
    });
    expect(f.status).toBe("instrument");
    expect(f.brief).toMatch(/仪器源 2/);
  });
});

describe("shouldBlockResultsWrite", () => {
  it("研究型 results + empty 才拦", () => {
    expect(shouldBlockResultsWrite("research", "results", "empty")).toBe(true);
    expect(shouldBlockResultsWrite("research", "Results", "empty")).toBe(true);
  });

  it("有声明或表不拦", () => {
    expect(shouldBlockResultsWrite("research", "results", "claims_only")).toBe(false);
    expect(shouldBlockResultsWrite("research", "results", "tabular")).toBe(false);
    expect(shouldBlockResultsWrite("research", "results", "instrument")).toBe(false);
  });

  it("综述 / 方法 / 讨论 / 引言不拦", () => {
    expect(shouldBlockResultsWrite("review", "results", "empty")).toBe(false);
    expect(shouldBlockResultsWrite("research", "methods", "empty")).toBe(false);
    expect(shouldBlockResultsWrite("research", "discussion", "empty")).toBe(false);
    expect(shouldBlockResultsWrite("research", "introduction", "empty")).toBe(false);
  });

  it("拒写文案指向附件而不是 data Tab", () => {
    expect(resultsWriteBlockMessage()).toMatch(/对话框上传/);
    expect(resultsWriteBlockMessage()).not.toMatch(/数据面板|data Tab/);
  });
});
