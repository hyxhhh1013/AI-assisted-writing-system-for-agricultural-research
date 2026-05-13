import { describe, it, expect } from "vitest";
import {
  writingSchema,
  outlineSchema,
  translateSchema,
  analysisSchema,
  consistencySchema,
  chatSchema,
  plagiarismCheckSchema,
  plagiarismRewriteSchema,
  knowledgeAnalyzeSchema,
} from "@/lib/validations";

describe("writingSchema", () => {
  it("accepts valid input", () => {
    const result = writingSchema.safeParse({ title: "test", section: "abstract" });
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = writingSchema.safeParse({ title: "", section: "abstract" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid section", () => {
    const result = writingSchema.safeParse({ title: "test", section: "invalid" });
    expect(result.success).toBe(false);
  });

  it("applies defaults", () => {
    const result = writingSchema.safeParse({ title: "test", section: "introduction" });
    if (result.success) {
      expect(result.data.language).toBe("zh");
      expect(result.data.template).toBe("sci");
      expect(result.data.mode).toBe("full");
    }
  });
});

describe("plagiarismCheckSchema", () => {
  it("rejects short content", () => {
    const result = plagiarismCheckSchema.safeParse({ title: "test", content: "short" });
    expect(result.success).toBe(false);
  });

  it("accepts content >= 50 chars", () => {
    const result = plagiarismCheckSchema.safeParse({
      title: "test",
      content: "a".repeat(50),
    });
    expect(result.success).toBe(true);
  });
});

describe("chatSchema", () => {
  it("rejects empty messages", () => {
    const result = chatSchema.safeParse({ filename: "test.pdf", messages: [] });
    expect(result.success).toBe(false);
  });
});

describe("consistencySchema", () => {
  it("rejects empty sections array", () => {
    const result = consistencySchema.safeParse({ title: "test", sections: [] });
    expect(result.success).toBe(false);
  });
});

describe("async validator helper", () => {
  it("works with async patterns", async () => {
    const result = outlineSchema.safeParse({ title: "test" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe("zh");
    }
  });
});
