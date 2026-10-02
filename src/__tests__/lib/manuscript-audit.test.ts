import { describe, expect, it } from "vitest";
import { auditManuscript } from "@/lib/agent/manuscript-audit";

describe("auditManuscript", () => {
  it("flags duplicate leaf headings in one section", () => {
    const report = auditManuscript({
      mode: "review",
      sections: {
        background:
          "3.1 总体轮廓\n第一段已经写好了，并且超过四十个汉字用来避免被当成占位 stub。\n\n"
          + "2.1 总体轮廓\n又写了一遍同样的轮廓。",
      },
    });
    expect(report.issues.some((i) => i.code === "duplicate_subsection_title")).toBe(true);
    expect(report.repairCount).toBeGreaterThan(0);
  });

  it("flags empty literature_body when background is already long", () => {
    const report = auditManuscript({
      mode: "review",
      sections: {
        background: "背".repeat(900),
        literature_body: "",
      },
    });
    expect(report.issues.some((i) => i.code === "review_body_skipped")).toBe(true);
  });

  it("flags invented temperatures against the abstract pool", () => {
    const report = auditManuscript({
      mode: "review",
      sections: {
        introduction:
          "生物炭施用后土壤有机碳储量上升。不同热解温度下营养元素保留率仍不清楚。"
          + "田间试验设置三个温度水平。该趋势与已有吸附研究一致，预处理常在 260℃ 进行。",
      },
      softRefs: [
        { n: 1, abstract: "Biochar generally improves soil aggregation under field conditions." },
      ],
      maxRefIndex: 3,
    });
    expect(report.issues.some((i) => i.code === "cite_semantic_mismatch")).toBe(true);
  });

  it("flags citation pile-on to a few numbers", () => {
    const body = Array.from({ length: 10 }, () => "已有试验表明孔隙增加[25][27][28]。").join("");
    const report = auditManuscript({
      mode: "review",
      sections: { background: body },
      maxRefIndex: 28,
    });
    expect(report.issues.some((i) => i.code === "cite_concentration")).toBe(true);
  });

  it("flags outline headings missing from the body", () => {
    const report = auditManuscript({
      mode: "review",
      outline: "1. 引言\n2. 进展\n2.1 预处理对孔隙结构的影响\n2.2 热解终温与停留时间\n",
      sections: {
        background: "2.1 预处理对孔隙结构的影响\n只写了预处理，停留时间还没有出现。",
      },
    });
    expect(report.issues.some((i) => i.code === "outline_heading_unwritten")).toBe(true);
  });
});
