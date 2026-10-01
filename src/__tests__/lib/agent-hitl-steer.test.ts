import { describe, expect, it } from "vitest";
import { pickIntentNudge } from "@/lib/agent/core/goal-intents";
import {
  OUTLINE_PREREQ_QUESTION,
  readOutlinePrereqConsent,
} from "@/lib/agent/core/outline-prereq-consent";
import { latestActionIsVisibleDeliverable } from "@/lib/agent/core/visible-deliverable";

describe("outline prereq consent", () => {
  it("asks before generating when the user has not answered", () => {
    expect(OUTLINE_PREREQ_QUESTION).toContain("出一版");
    expect(
      readOutlinePrereqConsent([{ role: "user", content: "写引言" }]).kind,
    ).toBe("unset");
  });

  it("treats a short yes as generate", () => {
    expect(
      readOutlinePrereqConsent([
        { role: "user", content: "写引言" },
        { role: "user", content: "【用户回答】出一版\n请据此继续执行。" },
      ]),
    ).toEqual({ kind: "generate" });
  });

  it("keeps a pasted skeleton", () => {
    const note = "1. 引言\n2. 方法\n3. 结果";
    expect(
      readOutlinePrereqConsent([
        { role: "user", content: `【用户回答】${note}` },
      ]),
    ).toEqual({ kind: "skeleton", skeleton: note });
  });

  it("holds when the user declines generation", () => {
    expect(
      readOutlinePrereqConsent([
        { role: "user", content: "【用户回答】先别生成" },
      ]).kind,
    ).toBe("hold");
  });
});

describe("visible deliverable stop", () => {
  it("stops after write even if citation check ran afterwards", () => {
    expect(
      latestActionIsVisibleDeliverable([
        { tool: "search_knowledge", success: true },
        { tool: "write_section", success: true },
        { tool: "validate_citations", success: true },
      ]),
    ).toBe(true);
  });

  it("does not treat a later search as already delivered", () => {
    expect(
      latestActionIsVisibleDeliverable([
        { tool: "write_section", success: true },
        { tool: "search_external", success: true },
      ]),
    ).toBe(false);
  });

  it("does not stop after generate_table that never entered the body", () => {
    expect(
      latestActionIsVisibleDeliverable([
        { tool: "generate_table", success: true, data: { html: "<table/>" } },
      ]),
    ).toBe(false);
  });

  it("stops after Seedream illustration candidates even without body insert", () => {
    expect(
      latestActionIsVisibleDeliverable([
        {
          tool: "illustrate_mechanism_figure",
          success: true,
          data: { action: "generate", persisted: false, imageUrl: "/api/charts/c.png" },
        },
      ]),
    ).toBe(true);
  });
});

describe("literature batch stop", () => {
  it("does not nudge another import after one batch landed", () => {
    expect(
      pickIntentNudge({
        goal: "检索生物炭文献",
        observations: [],
        intentKind: "literature",
        searchedOk: true,
        importCount: 8,
        importTarget: 15,
        refTotal: 8,
        wroteOk: false,
      }),
    ).toBeNull();
  });
});
