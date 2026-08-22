import { describe, expect, it } from "vitest";
import {
  appendQaNoteToSummary,
  evaluateSectionWritingQa,
} from "@/lib/agent/writing-qa-run";

describe("evaluateSectionWritingQa", () => {
  it("干净研究段落通过", () => {
    const report = evaluateSectionWritingQa({
      sectionKey: "introduction",
      text: [
        "生物炭施用后土壤有机碳储量上升。",
        "不同热解温度下营养元素保留率仍不清楚。",
        "田间试验设置三个温度水平。",
        "该趋势与已有吸附研究一致。",
      ].join("\n"),
    });
    expect(report.verdict).toBe("pass");
    expect(report.findings).toEqual([]);
  });

  it("升格 WQC 喉清开场为 repair", () => {
    const report = evaluateSectionWritingQa({
      sectionKey: "introduction",
      text: [
        "众所周知，生物炭具有吸附性能。",
        "值得注意的是，温度影响孔隙。",
      ].join("\n"),
    });
    expect(report.verdict).toBe("repair");
    expect(report.findings.some((f) => f.code === "throat_clear")).toBe(true);
  });

  it("空话套话与结果节讨论句式", () => {
    const hollow = evaluateSectionWritingQa({
      sectionKey: "introduction",
      text: "该方法具有重要的意义，也展现出较大的潜力。",
    });
    expect(hollow.findings.some((f) => f.code === "hollow_phrase")).toBe(true);

    const bleed = evaluateSectionWritingQa({
      sectionKey: "results",
      text: "产量增加。这可能反映根系吸收增强，或许由于孔隙度上升。",
    });
    expect(bleed.findings.some((f) => f.code === "results_discussion_bleed")).toBe(true);
    expect(
      evaluateSectionWritingQa({
        sectionKey: "discussion",
        text: "这可能反映根系吸收增强。",
      }).findings.some((f) => f.code === "results_discussion_bleed"),
    ).toBe(false);
  });

  it("摘要引用、Markdown 标题、文末文献表", () => {
    const abs = evaluateSectionWritingQa({
      sectionKey: "abstract",
      text: "本研究表明处理有效[1]。",
    });
    expect(abs.findings.some((f) => f.code === "abstract_has_cite")).toBe(true);

    const md = evaluateSectionWritingQa({
      sectionKey: "methods",
      text: "### 试验设计\n盆栽试验分为三组。",
    });
    expect(md.findings.some((f) => f.code === "md_heading")).toBe(true);

    const bib = evaluateSectionWritingQa({
      sectionKey: "introduction",
      text: "前文已述研究缺口。\n\n## 参考文献\n[1] Zhang 2020.\n",
    });
    expect(bib.findings.some((f) => f.code === "embedded_bib")).toBe(true);
  });

  it("连续句长过齐记 warn，且 summary 声明不阻断", () => {
    const sentences = [
      "田间观测显示处理组叶片更绿一些。",
      "室内培养显示处理组根系更深一些。",
      "盆栽结果显处理组分蘖更多一些。",
      "小区试验显处理组穗数更高一些。",
      "重复试验显处理组粒重更大一些。",
    ];
    const report = evaluateSectionWritingQa({
      sectionKey: "results",
      text: sentences.join(""),
    });
    expect(report.findings.some((f) => f.code === "sentence_monotone")).toBe(true);
    expect(report.findings.find((f) => f.code === "sentence_monotone")?.action).toBe("warn");
    expect(appendQaNoteToSummary("已写回 results", report)).toContain("不阻断写回");
  });

  it("结果节精确数字不在 dataClaims → block", () => {
    const report = evaluateSectionWritingQa({
      sectionKey: "results",
      text: "处理组产量为 99.99 kg/ha。田间小区设置三个重复。",
      dataClaims: [
        {
          id: "D1-C1",
          sourceId: "D1",
          sourceType: "data",
          type: "mean",
          text: "处理组土壤有机碳 18.6",
          values: { mean: 18.6 },
          variables: ["土壤有机碳"],
          tolerance: 0.05,
        },
      ],
    });
    expect(report.verdict).toBe("block");
    expect(report.findings.some((f) => f.code === "number_not_in_claims")).toBe(true);
    expect(appendQaNoteToSummary("已生成 results", report)).toContain("未写入章节");
  });

  it("结果节图号 / p 值不对账为编造数字", () => {
    const report = evaluateSectionWritingQa({
      sectionKey: "results",
      text: "见图 2.1。处理组土壤有机碳为 18.6 g/kg，差异显著（p = 0.05）。",
      dataClaims: [
        {
          id: "D1-C1",
          sourceId: "D1",
          sourceType: "data",
          type: "mean",
          text: "处理组土壤有机碳 18.6",
          values: { mean: 18.6 },
          variables: ["土壤有机碳"],
          tolerance: 0.05,
        },
      ],
    });
    expect(report.findings.some((f) => f.code === "number_not_in_claims")).toBe(false);
    expect(report.verdict).not.toBe("block");
  });

  it("maxRefIndex 命中 cite_oob", () => {
    const report = evaluateSectionWritingQa({
      sectionKey: "introduction",
      text: "前文已述机制[1][9]。田间试验设置三个温度水平。",
      maxRefIndex: 2,
    });
    expect(report.findings.some((f) => f.code === "cite_oob")).toBe(true);
    expect(report.verdict).toBe("repair");
  });

  it("合并 extraFindings 且不覆盖已有 code", () => {
    const report = evaluateSectionWritingQa({
      sectionKey: "introduction",
      text: "生物炭施用后土壤有机碳储量上升。田间试验设置三个温度水平。",
      extraFindings: [
        {
          code: "evidence_unbound",
          layer: "L0",
          action: "warn",
          message: "1 张主张未绑到文献",
          count: 1,
        },
      ],
    });
    expect(report.verdict).toBe("pass");
    expect(report.findings.some((f) => f.code === "evidence_unbound")).toBe(true);
  });
});
