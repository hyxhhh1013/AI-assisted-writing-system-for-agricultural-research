import { describe, expect, it } from "vitest";
import { resolveRagCategoryName, inferCategoriesFromTitle, inferCategoriesFromQuery } from "@/lib/knowledge-category-hints";

describe("resolveRagCategoryName", () => {
  it("maps 热解 to the on-disk 热化学 index", () => {
    expect(resolveRagCategoryName("热解")).toBe("热化学");
    expect(resolveRagCategoryName(" 热解 ")).toBe("热化学");
  });

  it("leaves real index names unchanged", () => {
    expect(resolveRagCategoryName("热化学")).toBe("热化学");
    expect(resolveRagCategoryName("茶学")).toBe("茶学");
    expect(resolveRagCategoryName("全部")).toBe("全部");
    expect(resolveRagCategoryName("")).toBeUndefined();
    expect(resolveRagCategoryName(undefined)).toBeUndefined();
  });
});

describe("inferCategoriesFromTitle", () => {
  it("does not map pyrolysis volatiles to 茶学", () => {
    expect(inferCategoriesFromTitle("生物油挥发性组分调控")).toEqual(["热化学"]);
    expect(inferCategoriesFromQuery("挥发性产物析出")).not.toContain("茶学");
  });

  it("still maps green tea aroma titles to 茶学", () => {
    expect(inferCategoriesFromTitle("绿茶香气挥发性成分")).toEqual(["茶学"]);
  });

  it("does not lock a farmland heavy-metal title to 热化学 just because it says 生物炭", () => {
    expect(
      inferCategoriesFromTitle("生物炭对农田土壤重金属钝化的研究进展"),
    ).not.toContain("热化学");
  });

  it("still maps an explicit pyrolysis title to 热化学", () => {
    expect(inferCategoriesFromTitle("热解温度对稻秆生物炭孔隙的影响")).toContain("热化学");
  });

  it("does not map carbon coating to 控释肥类", () => {
    expect(inferCategoriesFromQuery("carbon coating on nanocarbon")).not.toContain("控释肥类");
  });
});
