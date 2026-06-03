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

  it("accepts all valid modes with defaults", () => {
    for (const mode of ["full", "fast", "audit_only", "fix_only"]) {
      const r = writingSchema.safeParse({ title: "t", section: "abstract", mode });
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
