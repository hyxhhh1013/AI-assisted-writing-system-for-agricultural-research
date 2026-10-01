import { describe, expect, it } from "vitest";
import { latestActionIsVisibleDeliverable } from "@/lib/agent/core/visible-deliverable";
import {
  assetLandedInBody,
  inferInsertSectionKey,
  resolveInsertSectionKey,
} from "@/lib/agent/insert-section";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";

function snap(
  mode: "research" | "review",
  fills: { key: string; chars: number }[],
): AgentProjectSnapshot {
  return {
    title: "t",
    mode,
    language: "zh",
    template: "sci",
    citationStyle: "gbt7714",
    researchDirection: "soil",
    outline: "1",
    references: [],
    dataClaims: [],
    currentPhase: 4,
    hasWritingBlueprint: true,
    hasArgumentBlueprint: false,
    sectionFills: fills,
    hasPaperConfig: true,
  };
}

describe("inferInsertSectionKey", () => {
  it("prefers results when that section has body", () => {
    expect(
      inferInsertSectionKey(
        snap("research", [
          { key: "introduction", chars: 400 },
          { key: "results", chars: 800 },
        ]),
      ),
    ).toBe("results");
  });

  it("falls back to research results / review literature_body when empty", () => {
    expect(inferInsertSectionKey(snap("research", []))).toBe("results");
    expect(inferInsertSectionKey(snap("review", []))).toBe("literature_body");
  });
});

describe("resolveInsertSectionKey", () => {
  it("keeps an explicit valid key", () => {
    const r = resolveInsertSectionKey("methods", snap("research", []));
    expect(r).toEqual({ sectionKey: "methods", inferred: false });
  });

  it("rejects unknown keys", () => {
    const r = resolveInsertSectionKey("正文", snap("research", []));
    expect("error" in r).toBe(true);
  });

  it("infers when omitted", () => {
    const r = resolveInsertSectionKey(undefined, snap("research", []));
    expect(r).toEqual({ sectionKey: "results", inferred: true });
  });
});

describe("assetLandedInBody / visible deliverable", () => {
  it("does not treat a library-only table as delivered", () => {
    expect(assetLandedInBody({ latex: "\\begin{table}" })).toBe(false);
    expect(
      latestActionIsVisibleDeliverable([
        { tool: "generate_table", success: true, data: { latex: "x" } },
      ]),
    ).toBe(false);
  });

  it("stops the plan only after insert", () => {
    expect(
      latestActionIsVisibleDeliverable([
        {
          tool: "generate_table",
          success: true,
          data: { insertedSection: "results", verifiedInBody: true },
        },
      ]),
    ).toBe(true);
  });
});
