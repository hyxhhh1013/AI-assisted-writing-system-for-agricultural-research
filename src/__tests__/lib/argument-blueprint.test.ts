import { describe, expect, it } from "vitest";
import {
  isArgumentBlueprint,
  parseArgumentBlueprint,
  serializeArgumentBlueprint,
  type ArgumentBlueprint,
} from "@/contracts/argument-blueprint";

const sample: ArgumentBlueprint = {
  version: 1,
  centralThesis: "生物炭可改善土壤保水性并提升作物抗旱性",
  researchQuestion: "生物炭施用量如何影响土壤持水？",
  chains: [
    {
      id: "c1",
      claim: "适量生物炭提高田间持水量",
      evidence: "需引用：持水与孔隙结构相关田间试验",
      warrant: "增加微孔提高有效水储量，从而提升持水量",
      confidence: "medium",
    },
    {
      id: "c2",
      claim: "过量施用可能抑制根系生长",
      evidence: "需引用：高施量下根系生物量下降的报告",
      warrant: "过高 pH/盐分胁迫削弱根系扩展",
      confidence: "low",
    },
  ],
  rebuttals: [
    {
      id: "r1",
      objection: "效应因土壤类型而异",
      response: "按质地分层讨论并报告交互作用",
      relatedClaimId: "c1",
    },
  ],
  gaps: ["缺少本试验土壤的持水曲线"],
  generatedAt: 1,
};

describe("argument-blueprint contract", () => {
  it("round-trips serialize/parse", () => {
    const raw = serializeArgumentBlueprint(sample);
    const parsed = parseArgumentBlueprint(raw);
    expect(parsed?.centralThesis).toBe(sample.centralThesis);
    expect(parsed?.chains).toHaveLength(2);
    expect(isArgumentBlueprint(parsed)).toBe(true);
  });

  it("rejects incomplete payload", () => {
    expect(parseArgumentBlueprint(JSON.stringify({ version: 1 }))).toBeNull();
  });
});
