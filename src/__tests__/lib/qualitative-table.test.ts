import { describe, expect, it } from "vitest";
import { qualitativeTableMarkdown } from "@/lib/agent/tools/generate-table";

describe("qualitativeTableMarkdown", () => {
  it("renders a text comparison table and does not invent means", () => {
    const table = qualitativeTableMarkdown("表1 改性材料对比", [
      ["要点", "说明"],
      ["铁改性", "酸性土中更稳"],
    ]);
    expect(table?.markdown).toContain("**表1 改性材料对比**");
    expect(table?.markdown).toContain("| 铁改性 | 酸性土中更稳 |");
    expect(table?.markdown).not.toMatch(/mean|sd|显著性/i);
  });

  it("returns null when there is no body row", () => {
    expect(qualitativeTableMarkdown("表1", [["要点", "说明"]])).toBeNull();
  });
});
