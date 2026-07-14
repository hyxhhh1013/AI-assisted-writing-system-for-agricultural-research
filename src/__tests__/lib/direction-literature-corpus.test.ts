import { describe, expect, it } from "vitest";
import { applyLiteratureCorpusOps } from "@/lib/direction-literature-corpus";
import { emptyLiteratureState } from "@/contracts/direction-literature";

describe("applyLiteratureCorpusOps", () => {
  it("upserts and dedupes by doi", () => {
    const base = emptyLiteratureState();
    const entry = {
      id: "a",
      source: "external" as const,
      title: "Test Paper",
      citation: "[1] Test",
      role: "core" as const,
      doi: "10.1000/test",
      addedAt: 1,
    };
    let state = applyLiteratureCorpusOps(base, [{ op: "upsert", entry }]);
    expect(state.entries).toHaveLength(1);
    state = applyLiteratureCorpusOps(state, [
      { op: "upsert", entry: { ...entry, id: "b", title: "Updated" } },
    ]);
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].title).toBe("Updated");
    expect(state.confirmedAt).toBeUndefined();
  });

  it("confirm sets confirmedAt", () => {
    const state = applyLiteratureCorpusOps(emptyLiteratureState(), [{ op: "confirm" }]);
    expect(state.confirmedAt).toBeGreaterThan(0);
  });
});
