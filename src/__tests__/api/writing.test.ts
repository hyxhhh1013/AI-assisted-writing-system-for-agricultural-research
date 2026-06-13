import { describe, it, expect } from "vitest";
import {
  writingSchema,
  outlineSchema,
  translateSchema,
  consistencySchema,
  plagiarismCheckSchema,
} from "@/lib/validations";

describe("writing API — input validation", () => {
  it("accepts valid writing request", () => {
    const result = writingSchema.safeParse({
      title: "热解温度对生物炭产率的影响",
      section: "introduction",
      bullets: [
        "研究背景与生物炭改良土壤的机制要点",
        "实验设计与主要处理方法说明",
        "预期结果与讨论方向要点说明",
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing title", () => {
    const result = writingSchema.safeParse({ section: "abstract" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid section name", () => {
    const result = writingSchema.safeParse({
      title: "test",
      section: "bibliography",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid template", () => {
    const result = writingSchema.safeParse({
      title: "test",
      section: "abstract",
      template: "unknown",
    });
    expect(result.success).toBe(false);
  });

  it("accepts two bullets plus long supplemental context (full mode)", () => {
    const longContext = "补充说明".repeat(20);
    const r = writingSchema.safeParse({
      title: "test",
      section: "introduction",
      mode: "full",
      bullets: ["要点一足够长用于校验通过", "要点二足够长用于校验通过", ""],
      context: longContext,
    });
    expect(r.success).toBe(true);
  });

  it("accepts fast mode with short paragraph context", () => {
    const r = writingSchema.safeParse({
      title: "test",
      section: "introduction",
      mode: "fast",
      context: "这是一段足够长的段落内容用于快速扩写测试。",
    });
    expect(r.success).toBe(true);
  });

  it("rejects fast mode when context is too short", () => {
    const r = writingSchema.safeParse({
      title: "test",
      section: "introduction",
      mode: "fast",
      context: "太短",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("context"))).toBe(true);
    }
  });

  it("accepts all valid modes with defaults", () => {
    const readyBullets = [
      "要点一足够长用于校验通过",
      "要点二足够长用于校验通过",
      "要点三足够长用于校验通过",
    ];
    const draftBody = "这是一段足够长的正文，用于 audit 或 fix 模式校验。";
    for (const mode of ["full", "fast", "audit_only", "fix_only", "expand_bullet"]) {
      const payload =
        mode === "expand_bullet"
          ? {
              title: "t",
              section: "introduction",
              mode,
              bullets: readyBullets,
              bulletIndex: 0,
            }
          : mode === "audit_only" || mode === "fix_only"
            ? { title: "t", section: "abstract", mode, context: draftBody }
            : mode === "fast"
              ? { title: "t", section: "abstract", mode, context: "x".repeat(20) }
              : {
                  title: "t",
                  section: "abstract",
                  mode,
                  bullets: readyBullets,
                };
      const r = writingSchema.safeParse(payload);
      expect(r.success).toBe(true);
    }
  });
});

describe("outline API — input validation", () => {
  it("requires title", () => {
    const r = outlineSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("accepts minimal valid input", () => {
    const r = outlineSchema.safeParse({ title: "test" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.language).toBe("zh");
    }
  });
});

describe("translate API — input validation", () => {
  it("requires text", () => {
    const r = translateSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe("consistency API — input validation", () => {
  it("requires non-empty sections", () => {
    const r = consistencySchema.safeParse({ title: "test", sections: [] });
    expect(r.success).toBe(false);
  });

  it("accepts valid request", () => {
    const r = consistencySchema.safeParse({
      title: "test",
      sections: [
        { key: "introduction", content: "introduction content" },
        { key: "methods", content: "methods content" },
      ],
    });
    expect(r.success).toBe(true);
  });
});

describe("plagiarism API — input validation", () => {
  it("rejects content shorter than 50 chars", () => {
    const r = plagiarismCheckSchema.safeParse({ title: "test", content: "too short" });
    expect(r.success).toBe(false);
  });
});
