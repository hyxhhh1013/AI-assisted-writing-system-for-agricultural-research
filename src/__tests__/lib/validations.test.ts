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
  adminUserRolePatchSchema,
  adminProjectDeleteSchema,
  tableGenerateSchema,
  xrdBraggSchema,
  knowledgeDeleteBatchSchema,
  knowledgeBatchMoveSchema,
  projectMetaPatchSchema,
  projectSectionPatchSchema,
  projectReferencesPatchSchema,
  plagiarismRewritePatchSchema,
  reindexRequestSchema,
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

describe("adminUserRolePatchSchema", () => {
  it("rejects invalid role", () => {
    const result = adminUserRolePatchSchema.safeParse({ userId: "u1", role: "superadmin" });
    expect(result.success).toBe(false);
  });

  it("accepts valid patch", () => {
    const result = adminUserRolePatchSchema.safeParse({ userId: "u1", role: "admin" });
    expect(result.success).toBe(true);
  });
});

describe("adminProjectDeleteSchema", () => {
  it("rejects missing projectId", () => {
    expect(adminProjectDeleteSchema.safeParse({}).success).toBe(false);
  });
});

describe("tableGenerateSchema", () => {
  it("rejects fewer than 2 groups", () => {
    const result = tableGenerateSchema.safeParse({
      title: "表1",
      groups: [{ label: "A", n: 3, mean: 1, sd: 0.1 }],
    });
    expect(result.success).toBe(false);
  });
});

describe("xrdBraggSchema", () => {
  it("rejects empty hkl", () => {
    const result = xrdBraggSchema.safeParse({
      crystal_system: 1,
      lattice_init: [4, 4, 4, 90, 90, 90],
      hkl: [],
      exp_angles: [38.2],
    });
    expect(result.success).toBe(false);
  });
});

describe("knowledgeBatchMoveSchema", () => {
  it("rejects empty files", () => {
    expect(
      knowledgeBatchMoveSchema.safeParse({ action: "batch_move", files: [], newCategory: "A" }).success,
    ).toBe(false);
  });
});

describe("projectMetaPatchSchema", () => {
  it("rejects empty patch", () => {
    expect(projectMetaPatchSchema.safeParse({}).success).toBe(false);
  });

  it("accepts partial meta", () => {
    expect(projectMetaPatchSchema.safeParse({ title: "新标题" }).success).toBe(true);
  });
});

describe("plagiarismRewritePatchSchema", () => {
  it("rejects invalid status", () => {
    expect(
      plagiarismRewritePatchSchema.safeParse({ suggestionId: "s1", status: "pending" }).success,
    ).toBe(false);
  });
});

describe("reindexRequestSchema", () => {
  it("accepts empty body defaults", () => {
    expect(reindexRequestSchema.safeParse({}).success).toBe(true);
  });
});

describe("projectReferencesPatchSchema", () => {
  it("rejects empty ops", () => {
    expect(projectReferencesPatchSchema.safeParse({ ops: [] }).success).toBe(false);
  });

  it("accepts create/update/delete ops", () => {
    const result = projectReferencesPatchSchema.safeParse({
      ops: [
        { op: "create", content: "Author (2024). Title." },
        { op: "update", id: "ref-1", content: "Updated." },
        { op: "delete", id: "ref-2" },
      ],
    });
    expect(result.success).toBe(true);
  });
});
