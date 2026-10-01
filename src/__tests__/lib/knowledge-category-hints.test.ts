import { describe, expect, it } from "vitest";
import { resolveRagCategoryName } from "@/lib/knowledge-category-hints";

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
