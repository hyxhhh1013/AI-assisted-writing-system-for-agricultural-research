import { describe, expect, it } from "vitest";
import {
  confirmIdentity,
  isConfirmGranted,
} from "@/lib/agent/core/confirm-grant";
import {
  enrichImportReferenceParams,
  isRelevanceAcceptable,
  scoreLiteratureRelevance,
} from "@/lib/agent/literature-relevance";

describe("confirm-grant", () => {
  it("matches same hitJson regardless of userConfirmed", () => {
    const hitJson = JSON.stringify({
      id: "1",
      title: "Biochar soil",
      authors: [],
      source: "openalex",
    });
    const a = { hitJson, userConfirmed: true };
    const b = { hitJson };
    expect(confirmIdentity("import_reference", a)).toBe(
      confirmIdentity("import_reference", b),
    );
    expect(
      isConfirmGranted(
        { tool: "import_reference", params: b },
        "import_reference",
        a,
      ),
    ).toBe(true);
  });

  it("rejects different hitJson or tool", () => {
    const granted = {
      tool: "import_reference",
      params: { hitJson: '{"id":"a","title":"A","authors":[],"source":"openalex"}' },
    };
    expect(
      isConfirmGranted(granted, "import_reference", {
        hitJson: '{"id":"b","title":"B","authors":[],"source":"openalex"}',
      }),
    ).toBe(false);
    expect(
      isConfirmGranted(granted, "other_tool", granted.params),
    ).toBe(false);
  });
});

describe("LIT-QUALITY autoWhy must not satisfy hasWhy", () => {
  it("enrich does not invent why for low-relevance hits", () => {
    const hitJson = JSON.stringify({
      id: "1",
      title: "Quantum computing qubits",
      authors: ["A"],
      source: "openalex",
    });
    const enriched = enrichImportReferenceParams({
      hitJson,
      query: "生物炭 土壤",
    });
    expect(String(enriched.why ?? "")).toBe("");
    expect(String(enriched.autoWhy ?? "").length).toBeGreaterThan(0);
    const score = Number(enriched.relevanceScore);
    expect(
      isRelevanceAcceptable(score, {
        hasWhy: String(enriched.why ?? "").length >= 8,
      }),
    ).toBe(false);
  });

  it("real why still unlocks low score", () => {
    const rel = scoreLiteratureRelevance("foo", {
      title: "completely unrelated astronomy",
    });
    expect(rel.score).toBeLessThan(0.12);
    expect(isRelevanceAcceptable(rel.score, { hasWhy: true })).toBe(true);
  });
});
