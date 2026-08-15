import { describe, expect, it } from "vitest";
import { listMissingWritePrereqs } from "@/lib/agent/core/ensure-write-prereqs";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";

function snap(overrides: Partial<AgentProjectSnapshot> = {}): AgentProjectSnapshot {
  return {
    title: "T",
    mode: "review",
    language: "zh",
    template: "sci",
    citationStyle: "gbt7714",
    researchDirection: "x",
    outline: "",
    references: [],
    dataClaims: [],
    currentPhase: 1,
    hasWritingBlueprint: false,
    hasArgumentBlueprint: false,
    sectionFills: [],
    hasPaperConfig: true,
    ...overrides,
  };
}

describe("listMissingWritePrereqs", () => {
  it("lists outline then writing blueprint only (argument merged in)", () => {
    expect(listMissingWritePrereqs(snap())).toEqual([
      "generate_outline",
      "generate_writing_blueprint",
    ]);
    expect(
      listMissingWritePrereqs(
        snap({
          outline: "A".repeat(50),
          hasWritingBlueprint: true,
          hasArgumentBlueprint: false,
        }),
      ),
    ).toEqual([]);
    expect(
      listMissingWritePrereqs(
        snap({
          outline: "A".repeat(50),
          hasWritingBlueprint: true,
          hasArgumentBlueprint: true,
        }),
      ),
    ).toEqual([]);
  });
});
