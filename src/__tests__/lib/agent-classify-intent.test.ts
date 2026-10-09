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

  it("does not inherit diagnose on 继续", () => {
    expect(classifyIntent({ goal: "继续", previousKind: "diagnose" })).toEqual({
      kind: "review_write",
      source: "regex",
    });
  });

  it("does not inherit diagnose on a menu digit", () => {
    expect(classifyIntent({ goal: "1", previousKind: "diagnose" })).toEqual({
      kind: null,
      source: "regex",
    });
  });

  it("inherits on 继续 / 好 / 开始吧", () => {
    expect(classifyIntent({ goal: "继续", previousKind: "citation" }).source).toBe(
      "inherit",
    );
    expect(classifyIntent({ goal: "好", previousKind: "literature" }).kind).toBe(
      "literature",
    );
    expect(classifyIntent({ goal: "开始吧", previousKind: "ap_full" })).toEqual({
      kind: "ap_full",
      source: "inherit",
    });
  });

  it("follow-ups stay inherit so a regex-only LLM shadow would never see them", () => {
    for (const goal of ["A", "继续", "好", "ok"]) {
      expect(classifyIntent({ goal, previousKind: "draft" }).source).toBe("inherit");
    }
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
    expect(looksLikeFollowUpUtterance("开始吧")).toBe(true);
    expect(looksLikeFollowUpUtterance("写引言")).toBe(false);
  });
});

describe("classifyIntentFromRegex", () => {
  it("maps 写引言 to draft", () => {
    expect(classifyIntentFromRegex("写引言")).toBe("draft");
    expect(
      classifyIntentFromRegex(
        "老师使用不同的手机号码入职，重复招聘是要扣除的",
      ),
    ).toBeNull();
  });

  it("maps 按本题检索并导入相关文献 to literature", () => {
    expect(classifyIntentFromRegex("按本题检索并导入相关文献")).toBe("literature");
    expect(classifyIntentFromRegex("检索相关文献并总结研究缺口")).toBe("literature");
  });

  it("maps 优先补引用 to review_write not literature", () => {
    expect(classifyIntentFromRegex("优先补引用")).toBe("review_write");
    expect(classifyIntentFromRegex("把现有未引用文献织入正文")).toBe("review_write");
  });

  it("maps evidence_unbound 修补 to draft not literature/review_write", () => {
    expect(
      classifyIntentFromRegex(
        "修补已写的综述正文（evidence_unbound）：6 张主张未绑到文献，勿硬挂 [n]",
      ),
    ).toBe("draft");
  });
});
