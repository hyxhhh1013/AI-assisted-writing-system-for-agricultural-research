import { describe, it, expect } from "vitest";
import {
  contextLinesToBullets,
  formatWritingBulletsForPrompt,
  isWritingDraftReady,
  MAX_WRITING_BULLETS,
  MIN_BULLET_CHARS,
  MIN_WRITING_BULLETS,
  mergeWritingDraftParagraphs,
  normalizeWritingBullets,
  resolveWritingDraftContext,
  shouldUseCollaborativeBulletExpand,
} from "@/contracts/writing";
import { retrievePreviewSchema, writingSchema } from "@/lib/validations";

describe("normalizeWritingBullets", () => {
  it("trims, drops empty items, and caps at max", () => {
    const input = ["  a  ", "", "b", "c", "d", "e", "f", "g", "h", "i"];
    expect(normalizeWritingBullets(input)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(normalizeWritingBullets(input)).toHaveLength(MAX_WRITING_BULLETS);
  });
});

describe("resolveWritingDraftContext", () => {
  it("merges bullets and supplement into RAG context", () => {
    const merged = resolveWritingDraftContext("实验在 25°C 进行", [
      "背景：生物炭改良土壤",
      "方法：盆栽试验设计",
      "结果：产量提升趋势",
    ]);
    expect(merged).toContain("【本节扩写要点】");
    expect(merged).toContain("1. 背景：生物炭改良土壤");
    expect(merged).toContain("【补充说明】");
    expect(merged).toContain("实验在 25°C 进行");
  });
});

describe("isWritingDraftReady", () => {
  const validBullets = [
    "研究背景与问题陈述足够长",
    "主要方法或材料说明足够长",
    "预期结果或讨论方向足够长",
  ];

  it("accepts 3+ bullets when each meets min chars and total meets section min", () => {
    expect(isWritingDraftReady("", validBullets, "introduction")).toBe(true);
  });

  it("rejects bullets when any line is too short", () => {
    const short = [...validBullets];
    short[0] = "太短";
    expect(isWritingDraftReady("", short, "introduction")).toBe(false);
  });

  it("falls back to legacy context-only draft", () => {
    const longContext = "x".repeat(50);
    expect(isWritingDraftReady(longContext, [], "introduction")).toBe(true);
  });
});

describe("contextLinesToBullets", () => {
  it("pads to minimum bullet slots", () => {
    expect(contextLinesToBullets("only one line")).toHaveLength(MIN_WRITING_BULLETS);
  });

  it("strips list markers from outline lines", () => {
    const bullets = contextLinesToBullets("1. 第一点\n- 第二点\n• 第三点");
    expect(bullets[0]).toBe("第一点");
    expect(bullets[1]).toBe("第二点");
    expect(bullets[2]).toBe("第三点");
  });
});

describe("formatWritingBulletsForPrompt", () => {
  it("numbers normalized bullets", () => {
    expect(formatWritingBulletsForPrompt([" alpha ", "beta"])).toBe("1. alpha\n2. beta");
  });
});

describe("writingSchema bullets", () => {
  it("accepts bullets-only draft when ready", () => {
    const ok = writingSchema.safeParse({
      title: "Test",
      section: "introduction",
      bullets: Array.from({ length: MIN_WRITING_BULLETS }, (_, i) =>
        `要点内容足够长用于校验 ${i + 1}`,
      ),
    });
    expect(ok.success).toBe(true);
  });

  it("rejects when neither bullets nor context is usable", () => {
    const bad = writingSchema.safeParse({
      title: "Test",
      section: "introduction",
      context: "",
      bullets: ["短", "短", "短"],
    });
    expect(bad.success).toBe(false);
  });
});

describe("writingSchema expand_bullet", () => {
  const readyBullets = Array.from({ length: MIN_WRITING_BULLETS }, (_, i) =>
    `要点内容足够长用于 expand_bullet ${i + 1}`,
  );

  it("accepts expand_bullet with bulletIndex and draftSoFar", () => {
    const ok = writingSchema.safeParse({
      title: "Test",
      section: "introduction",
      mode: "expand_bullet",
      bullets: readyBullets,
      bulletIndex: 1,
      draftSoFar: "已采纳的第一段内容。",
      context: "补充说明",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects expand_bullet without bulletIndex", () => {
    const bad = writingSchema.safeParse({
      title: "Test",
      section: "introduction",
      mode: "expand_bullet",
      bullets: readyBullets,
    });
    expect(bad.success).toBe(false);
  });
});

describe("shouldUseCollaborativeBulletExpand", () => {
  it("uses bullet flow only for standard mode with enough bullets", () => {
    const bullets = ["a".repeat(MIN_BULLET_CHARS), "b".repeat(MIN_BULLET_CHARS), "c".repeat(MIN_BULLET_CHARS)];
    expect(shouldUseCollaborativeBulletExpand("standard", bullets)).toBe(true);
    expect(shouldUseCollaborativeBulletExpand("preview", bullets)).toBe(false);
  });
});

describe("mergeWritingDraftParagraphs", () => {
  it("joins paragraphs with blank line", () => {
    expect(mergeWritingDraftParagraphs("第一段", "第二段")).toBe("第一段\n\n第二段");
    expect(mergeWritingDraftParagraphs("", "仅一段")).toBe("仅一段");
  });
});

describe("retrievePreviewSchema with bullets", () => {
  const readyBullets = Array.from({ length: MIN_WRITING_BULLETS }, (_, i) =>
    `检索要点描述足够长 ${i + 1}`.padEnd(MIN_BULLET_CHARS + 4, "。"),
  );

  it("rejects empty draft", () => {
    const bad = retrievePreviewSchema.safeParse({
      title: "Test",
      section: "introduction",
      context: "",
      bullets: [],
    });
    expect(bad.success).toBe(false);
  });

  it("accepts bullets-based preview request", () => {
    const ok = retrievePreviewSchema.safeParse({
      title: "Test",
      section: "introduction",
      bullets: readyBullets,
    });
    expect(ok.success).toBe(true);
  });
});
