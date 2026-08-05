import { describe, it, expect, vi } from "vitest";
import { emitDraftReferences } from "@/app/api/writing/pipeline/finalize";
import type { PreparedWritingContext } from "@/app/api/writing/types";

function makePrepared(overrides: Partial<PreparedWritingContext> = {}): PreparedWritingContext {
  return {
    systemPrompt: "",
    resolvedSectionPrompt: "",
    contextText: "",
    refRangeHint: "",
    refMapping: { "old.pdf": 1, "new.pdf": 2 },
    referencesByIndex: ["old.pdf", "new.pdf"],
    newSources: ["new.pdf"],
    evidenceSummary: "",
    globalReferenceInfo: "",
    refCount: 2,
    dataClaimCount: 0,
    ...overrides,
  };
}

describe("emitDraftReferences", () => {
  it("emits all cited references in first-appearance order, not only new sources", () => {
    const emit = vi.fn();
    const draft = "综述段落 [1] 与 [2] 的结论。";

    const usedNew = emitDraftReferences(draft, makePrepared(), emit);

    expect(usedNew).toEqual(["new.pdf"]);
    expect(emit).toHaveBeenCalledWith({
      type: "references",
      references: ["old.pdf", "new.pdf"],
      refMapping: { "old.pdf": 1, "new.pdf": 2 },
    });
  });

  it("emits cited existing-only references when no new source is cited", () => {
    const emit = vi.fn();
    const draft = "仅引用既有文献 [1]。";

    const usedNew = emitDraftReferences(draft, makePrepared(), emit);

    expect(usedNew).toEqual([]);
    // 紧凑重排：仅保留被引文献，refMapping 重建为连续 1..K（未引用的 new.pdf 不进映射）
    expect(emit).toHaveBeenCalledWith({
      type: "references",
      references: ["old.pdf"],
      refMapping: { "old.pdf": 1 },
    });
  });

  it("works for research-style IMRaD draft citing mixed sources", () => {
    const emit = vi.fn();
    const draft = "Results showed significant yield increase [1,3]. Prior work [2] supports this.";

    emitDraftReferences(
      draft,
      makePrepared({
        referencesByIndex: ["smith2020.pdf", "lee2019.pdf", "wang2021.pdf"],
        newSources: ["wang2021.pdf"],
        refMapping: { "smith2020.pdf": 1, "lee2019.pdf": 2, "wang2021.pdf": 3 },
      }),
      emit,
    );

    // 正文重排 [1,3]→[1,2]、[2]→[3]，先发 corrected_text
    expect(emit).toHaveBeenCalledWith({
      type: "corrected_text",
      text: "Results showed significant yield increase [1, 2]. Prior work [3] supports this.",
    });
    // references 按首次出现紧凑重排，refMapping 重建为连续索引（与 references 顺序对齐）
    expect(emit).toHaveBeenCalledWith({
      type: "references",
      references: ["smith2020.pdf", "wang2021.pdf", "lee2019.pdf"],
      refMapping: { "smith2020.pdf": 1, "wang2021.pdf": 2, "lee2019.pdf": 3 },
    });
  });
});
