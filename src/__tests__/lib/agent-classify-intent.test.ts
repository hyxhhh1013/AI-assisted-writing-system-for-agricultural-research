import { describe, expect, it } from "vitest";
import {
  classifyIntent,
  classifyIntentFromRegex,
  looksLikeFollowUpUtterance,
} from "@/lib/agent/core/classify-intent";

describe("classifyIntent", () => {
  it("inherits draft when follow-up is A", () => {
    const result = classifyIntent({
      goal: "A",
      previousKind: "draft",
    });
    expect(result).toEqual({ kind: "draft", source: "inherit" });
  });

  it("inherits on 继续 / 好", () => {
    expect(classifyIntent({ goal: "继续", previousKind: "citation" }).source).toBe(
      "inherit",
    );
    expect(classifyIntent({ goal: "好", previousKind: "literature" }).kind).toBe(
      "literature",
    );
  });

  it("reclassifies when the user clearly switches tasks", () => {
    const result = classifyIntent({
      goal: "检查引用编号对不对",
      previousKind: "draft",
    });
    expect(result.source).toBe("regex");
    expect(result.kind).toBe("citation");
  });

  it("classifies a first-turn draft goal without previousKind", () => {
    const result = classifyIntent({ goal: "写引言" });
    expect(result).toEqual({ kind: "draft", source: "regex" });
  });
});

describe("looksLikeFollowUpUtterance", () => {
  it("treats short confirmations as follow-ups", () => {
    expect(looksLikeFollowUpUtterance("A")).toBe(true);
    expect(looksLikeFollowUpUtterance("ok")).toBe(true);
    expect(looksLikeFollowUpUtterance("写引言")).toBe(false);
  });
});

describe("classifyIntentFromRegex", () => {
  it("maps 写引言 to draft", () => {
    expect(classifyIntentFromRegex("写引言")).toBe("draft");
  });
});
