import { describe, expect, it } from "vitest";
import {
  isArgumentBlueprintConfirmed,
  parseArgumentBlueprint,
  serializeArgumentBlueprint,
} from "@/contracts/argument-blueprint";

describe("argument-blueprint contract", () => {
  it("roundtrips serialize/parse and detects confirmation", () => {
    const raw = serializeArgumentBlueprint({
      version: 1,
      thesis: "生物炭可改善盐碱地养分有效性",
      logicalFlow: "问题—机制—证据—局限",
      claims: [
        {
          id: "c1",
          claim: "施用生物炭提高土壤有效磷",
          evidence: ["温室试验", "田间验证"],
          sectionPath: "结果与分析",
        },
      ],
      generatedAt: 1,
      confirmedAt: 2,
    });
    const parsed = parseArgumentBlueprint(raw);
    expect(parsed?.thesis).toContain("生物炭");
    expect(isArgumentBlueprintConfirmed(parsed)).toBe(true);
    expect(isArgumentBlueprintConfirmed({ ...parsed!, confirmedAt: undefined })).toBe(false);
  });
});
