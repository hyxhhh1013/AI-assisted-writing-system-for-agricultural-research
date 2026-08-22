import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const findMany = vi.fn();
const groupBy = vi.fn();

/** 测试可注入的 data 目录；缺省指向不存在路径 → 磁盘分类为空 */
let fakeDataDir = path.join(os.tmpdir(), "km-test-nonexistent-data");

vi.mock("@/lib/prisma", () => ({
  default: {
    knowledgeFile: {
      findMany,
      findUnique: vi.fn(),
      groupBy,
    },
  },
}));

vi.mock("@/lib/runtime-paths", () => ({
  resolveProjectRuntimePath: (...parts: string[]) => {
    const joined = parts.join("/");
    if (joined === "data" || joined.startsWith("data/")) {
      return joined === "data" ? fakeDataDir : path.join(fakeDataDir, parts.slice(1).join("/"));
    }
    return path.join(os.tmpdir(), "km-test-nonexistent", joined);
  },
}));

const tmpDirs: string[] = [];
afterAll(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("knowledge-metadata", () => {
  beforeEach(() => {
    vi.resetModules();
    findMany.mockReset();
    groupBy.mockReset();
    delete process.env.USE_METADATA_JSON_FALLBACK;
    fakeDataDir = path.join(os.tmpdir(), "km-test-nonexistent-data");
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

  it("listKnowledgeCategories merges disk index_*.json categories (外部摘要等仅索引分类)", async () => {
    fakeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "km-test-data-"));
    tmpDirs.push(fakeDataDir);
    fs.writeFileSync(
      path.join(fakeDataDir, "index_外部摘要.json"),
      JSON.stringify({ chunks: [] }),
      "utf8",
    );
    findMany.mockResolvedValue([{ category: "土壤" }]);

    const { listKnowledgeCategories } = await import("@/lib/knowledge-metadata");
    const cats = await listKnowledgeCategories();

    expect(cats).toEqual(["土壤", "外部摘要"]);
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
