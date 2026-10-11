import { describe, expect, it } from "vitest";
import { containmentSimilarity, jaccardOfTexts, buildPassageIndex, topPassages } from "@/lib/text-fingerprint";

const SENTENCE = "生物炭在热解过程中保留了木质素芳香结构并提高了土壤阳离子交换量";
const LONG = `${SENTENCE}随后我们讨论了温度停留时间和载气流量对产率的影响并补充了三组重复实验的误差范围以及灰分含量变化`;

describe("text fingerprint", () => {
  it("scores a copied sentence inside a longer passage higher than symmetric jaccard", () => {
    const containment = containmentSimilarity(SENTENCE, LONG);
    expect(containment).toBeGreaterThan(0.9);
    expect(containment).toBeGreaterThan(jaccardOfTexts(SENTENCE, LONG));
  });

  it("retrieves the same passage on repeated queries", () => {
    const index = buildPassageIndex([
      { text: "无关的土壤采样描述用于对照，不包含生物炭芳香结构。", from: "其他" },
      { text: LONG, from: "稻壳生物炭.pdf" },
    ]);
    const first = topPassages(index, SENTENCE, 1)[0];
    const second = topPassages(index, SENTENCE, 1)[0];
    expect(first?.from).toBe("稻壳生物炭.pdf");
    expect(second?.from).toBe(first?.from);
  });
});
