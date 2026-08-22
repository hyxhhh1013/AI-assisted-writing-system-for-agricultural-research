import { describe, expect, it } from "vitest";
import { buildQualityClosure } from "@/lib/agent/quality-closure";

/** 构造有完整正文的项目（research 模式各节需超过 minChars：引言1000/方法1500/结果1500/结论600/摘要250） */
function fullSections(): Record<string, string> {
  return {
    introduction: "x".repeat(1200),
    methods: "x".repeat(1600),
    results: "x".repeat(1600),
    discussion: "x".repeat(1300),
    conclusion: "x".repeat(800),
    abstract: "x".repeat(300),
  };
}

describe("buildQualityClosure", () => {
  it("全部达标 + 引用通过 + 已审查 → readyToClose", () => {
    const r = buildQualityClosure({
      sections: fullSections(),
      mode: "research",
      language: "zh",
      citationPassed: true,
      reviewDone: true,
    });
    expect(r.readyToClose).toBe(true);
    expect(r.okCount).toBe(5);
    expect(r.signals.find((s) => s.key === "prose")?.status).toBe("ok");
    expect(r.summary).toContain("就绪");
  });

  it("节完整不足 → coverage warn", () => {
    const r = buildQualityClosure({
      sections: { introduction: "x".repeat(300) }, // 缺多数必写节
      mode: "research",
      language: "zh",
      citationPassed: true,
      reviewDone: true,
    });
    const coverage = r.signals.find((s) => s.key === "coverage");
    expect(coverage?.status).toBe("warn");
    expect(r.readyToClose).toBe(false);
  });

  it("摘要空白 → missing", () => {
    const r = buildQualityClosure({
      sections: { ...fullSections(), abstract: "" },
      mode: "research",
      language: "zh",
      citationPassed: true,
      reviewDone: true,
    });
    const abs = r.signals.find((s) => s.key === "abstract");
    expect(abs?.status).toBe("missing");
    expect(r.summary).toContain("摘要");
  });

  it("引用门禁未通过 → warn，未检查(null) → missing", () => {
    const r1 = buildQualityClosure({
      sections: fullSections(),
      mode: "research",
      language: "zh",
      citationPassed: false,
      reviewDone: true,
    });
    expect(r1.signals.find((s) => s.key === "citation")?.status).toBe("warn");

    const r2 = buildQualityClosure({
      sections: fullSections(),
      mode: "research",
      language: "zh",
      citationPassed: null,
      reviewDone: true,
    });
    expect(r2.signals.find((s) => s.key === "citation")?.status).toBe("missing");
  });

  it("未审查 → missing，summary 提示还差审查", () => {
    const r = buildQualityClosure({
      sections: fullSections(),
      mode: "research",
      language: "zh",
      citationPassed: true,
      reviewDone: false,
    });
    expect(r.signals.find((s) => s.key === "review")?.status).toBe("missing");
    expect(r.summary).toContain("审查");
  });

  it("正文空话套话 → prose warn，四灯全绿也不能收口", () => {
    const r = buildQualityClosure({
      sections: {
        ...fullSections(),
        introduction:
          "该方法具有重要的意义，也展现出较大的潜力。".padEnd(1200, "述"),
      },
      mode: "research",
      language: "zh",
      citationPassed: true,
      reviewDone: true,
    });
    expect(r.signals.find((s) => s.key === "prose")?.status).toBe("warn");
    expect(r.readyToClose).toBe(false);
    expect(r.summary).toContain("可优化");
  });

  it("非字符串章节不抛错", () => {
    expect(() =>
      buildQualityClosure({
        sections: { introduction: { html: "<p>x</p>" } } as unknown as Record<string, string>,
        mode: "research",
        language: "zh",
      }),
    ).not.toThrow();
  });
});
