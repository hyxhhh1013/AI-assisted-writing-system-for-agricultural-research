import { describe, expect, it } from "vitest";
import {
  composeExpandedParagraph,
  mergeSubsectionIntoSection,
} from "@/lib/writing-merge";

describe("composeExpandedParagraph", () => {
  it("appends when the model returns only new sentences", () => {
    expect(composeExpandedParagraph("原句。", "补充一句。")).toBe("原句。\n\n补充一句。");
  });

  it("keeps a rewrite that already starts with the original", () => {
    const o = "原句。";
    const g = "原句。后面加长了很多内容。";
    expect(composeExpandedParagraph(o, g)).toBe(g);
  });
});

describe("mergeSubsectionIntoSection", () => {
  it("appends into an existing subsection instead of replacing it", () => {
    const existing = "2.1 温度\n第一段已经写好了，并且超过四十个汉字用来避免被当成占位 stub。\n\n2.2 下一节\n别的。";
    const next = mergeSubsectionIntoSection({
      existingText: existing,
      incoming: "新增第二段。",
      subsectionTitle: "温度",
      appendIfPresent: true,
    });
    expect(next).toContain("第一段已经写好了");
    expect(next).toContain("新增第二段。");
    expect(next).toContain("2.2 下一节");
  });

  it("strips blueprint breadcrumb glued to the first sentence", () => {
    const next = mergeSubsectionIntoSection({
      existingText: "",
      incoming:
        "1.1 引言 > 2.2 核心概念与问题框架 热解温度通常指反应器所达到的峰值温度。",
      subsectionTitle: "1.1 引言 > 2.2 核心概念与问题框架",
      sectionKey: "background",
    });
    expect(next).not.toContain(">");
    expect(next).toMatch(/^2\.\d+ 核心概念与问题框架\n/);
    expect(next).toContain("热解温度通常指反应器所达到的峰值温度。");
  });

  it("fills an empty subsection without duplicating the heading", () => {
    const existing = "2.1 温度\n\n2.2 下一节\n别的。";
    const next = mergeSubsectionIntoSection({
      existingText: existing,
      incoming: "2.1 温度\n首稿。",
      subsectionTitle: "温度",
    });
    expect(next.match(/温度/g)?.length).toBe(1);
    expect(next).toContain("首稿。");
  });
});
