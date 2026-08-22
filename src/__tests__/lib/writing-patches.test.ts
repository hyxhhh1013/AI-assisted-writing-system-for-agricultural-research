import { describe, expect, it } from "vitest";
import { evaluateSectionWritingQa } from "@/lib/agent/writing-qa-run";
import {
  applyWritingPatches,
  formatWritingRefineFeedback,
  hasWritingRefineCandidate,
} from "@/lib/agent/writing-patches";

describe("applyWritingPatches", () => {
  it("strips throat-clear and hollow phrases", () => {
    const text =
      "众所周知，该方法具有重要的意义。值得注意的是，它也展现出较大的潜力。田间试验设置三个温度水平。";
    const qa = evaluateSectionWritingQa({ sectionKey: "introduction", text });
    const patched = applyWritingPatches(text, qa.findings);
    expect(patched.patches.some((p) => p.code === "throat_clear")).toBe(true);
    expect(patched.patches.some((p) => p.code === "hollow_phrase")).toBe(true);
    expect(patched.draft).not.toContain("众所周知");
    expect(patched.draft).not.toContain("具有重要的意义");
    expect(patched.draft).toContain("田间试验设置三个温度水平");
  });

  it("rewrites results discussion bleed and strips markdown headings", () => {
    const text = "### 产量\n产量增加。这可能反映根系吸收增强，或许由于孔隙度上升。";
    const qa = evaluateSectionWritingQa({ sectionKey: "results", text });
    const patched = applyWritingPatches(text, qa.findings);
    expect(patched.draft.startsWith("#")).toBe(false);
    expect(patched.draft).toContain("观察到");
    expect(patched.draft).not.toContain("可能反映");
  });

  it("strips abstract citations and out-of-range cites", () => {
    const abs = evaluateSectionWritingQa({
      sectionKey: "abstract",
      text: "处理有效[1]。",
    });
    expect(applyWritingPatches("处理有效[1]。", abs.findings).draft).toBe("处理有效。");

    const body = "前文已述[1][9]。";
    const oob = evaluateSectionWritingQa({
      sectionKey: "introduction",
      text: body,
      maxRefIndex: 2,
    });
    expect(oob.findings.some((f) => f.code === "cite_oob")).toBe(true);
    expect(applyWritingPatches(body, oob.findings, { maxRefIndex: 2 }).draft).toBe(
      "前文已述[1]。",
    );
  });

  it("hedges overclaim without touching 绝对值", () => {
    const text = "该效果毫无疑问，绝对值上升。";
    const qa = evaluateSectionWritingQa({ sectionKey: "discussion", text });
    const patched = applyWritingPatches(text, qa.findings);
    expect(patched.draft).toContain("现有数据表明");
    expect(patched.draft).toContain("绝对值");
    expect(patched.draft).not.toContain("毫无疑问");
  });

  it("does not treat warn findings as patches", () => {
    const sentences = [
      "田间观测显示处理组叶片更绿一些。",
      "室内培养显示处理组根系更深一些。",
      "盆栽结果显处理组分蘖更多一些。",
      "小区试验显处理组穗数更高一些。",
      "重复试验显处理组粒重更大一些。",
    ].join("");
    const qa = evaluateSectionWritingQa({ sectionKey: "results", text: sentences });
    const patched = applyWritingPatches(sentences, qa.findings);
    expect(patched.patches).toEqual([]);
    expect(patched.draft).toBe(sentences);
  });
});

describe("formatWritingRefineFeedback", () => {
  it("keeps code + excerpt and forbids a prose review dump", () => {
    const feedback = formatWritingRefineFeedback([
      {
        code: "cite_semantic_mismatch",
        layer: "L3",
        action: "repair",
        message: "编号与题录不对齐",
        examples: ["[3]"],
      },
    ]);
    expect(feedback).toContain("cite_semantic_mismatch");
    expect(feedback).toContain("[3]");
    expect(feedback).toContain("禁止整节重写");
    expect(feedback.length).toBeLessThan(400);
    expect(hasWritingRefineCandidate([{
      code: "cite_semantic_mismatch",
      layer: "L3",
      action: "repair",
      message: "x",
    }])).toBe(true);
  });
});
