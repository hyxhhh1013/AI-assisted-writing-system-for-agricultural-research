import { describe, expect, it } from "vitest";
import { formatToolObservationForLlm } from "@/lib/agent/observation-memory";

describe("formatToolObservationForLlm", () => {
  it("keeps search hit excerpts for later reasoning", () => {
    const text = formatToolObservationForLlm("search_knowledge", {
      success: true,
      summary: "命中 2 条",
      data: {
        hits: [
          { citation: "Smith 2020", excerpt: "biochar increased yield by 12%" },
          { citation: "Li 2021", excerpt: "salt stress mitigation via carbon" },
        ],
      },
    });
    expect(text).toContain("【证据摘录】");
    expect(text).toContain("biochar increased yield");
    expect(text).toContain("Smith 2020");
  });

  it("formats failures without inventing evidence", () => {
    const text = formatToolObservationForLlm("write_section", {
      success: false,
      error: "需要大纲",
    });
    expect(text).toContain("失败");
    expect(text).toContain("需要大纲");
    expect(text).not.toContain("【证据摘录】");
  });
});
