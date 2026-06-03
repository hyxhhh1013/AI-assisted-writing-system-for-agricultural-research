import { describe, expect, it, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const groupBy = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    knowledgeFile: {
      findMany,
      findUnique: vi.fn(),
      groupBy,
    },
  },
}));

describe("knowledge-metadata", () => {
  beforeEach(() => {
    vi.resetModules();
    findMany.mockReset();
    groupBy.mockReset();
    delete process.env.USE_METADATA_JSON_FALLBACK;
  });

  it("listKnowledgeCategories reads distinct categories from Prisma", async () => {
    findMany.mockResolvedValue([
      { category: "土壤" },
      { category: "未分类" },
      { category: "植保" },
    ]);

    const { listKnowledgeCategories } = await import("@/lib/knowledge-metadata");
    const cats = await listKnowledgeCategories();

    expect(cats).toEqual(["土壤", "植保"]);
    expect(findMany).toHaveBeenCalled();
  });

  it("matchCategoryFromDirection picks best keyword match", async () => {
    findMany.mockResolvedValue([
      { category: "热化学" },
      { category: "土壤改良" },
    ]);

    const { matchCategoryFromDirection } = await import("@/lib/knowledge-metadata");
    const cat = await matchCategoryFromDirection("研究生物质热化学转化机理");

    expect(cat).toBe("热化学");
  });
});
