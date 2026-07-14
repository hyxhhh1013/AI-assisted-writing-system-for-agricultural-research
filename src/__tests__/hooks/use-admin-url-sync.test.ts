import { describe, expect, it } from "vitest";
import {
  buildAdminUrlQueryFromPatch,
  readAdminUrlPage,
  readAdminUrlParam,
  readAdminUrlSortOrder,
} from "@/hooks/use-admin-url-sync";

describe("readAdminUrlPage", () => {
  it("parses valid page", () => {
    const params = new URLSearchParams("page=3");
    expect(readAdminUrlPage(params)).toBe(3);
  });

  it("falls back for invalid page", () => {
    expect(readAdminUrlPage(new URLSearchParams("page=0"), 1)).toBe(1);
    expect(readAdminUrlPage(new URLSearchParams("page=abc"), 2)).toBe(2);
  });
});

describe("readAdminUrlParam", () => {
  it("reads category for knowledge deep link", () => {
    const params = new URLSearchParams("category=未分类");
    expect(readAdminUrlParam(params, "category")).toBe("未分类");
  });
});

describe("readAdminUrlSortOrder", () => {
  it("validates sort order", () => {
    expect(readAdminUrlSortOrder(new URLSearchParams("sortOrder=asc"))).toBe("asc");
    expect(readAdminUrlSortOrder(new URLSearchParams("sortOrder=invalid"), "desc")).toBe("desc");
  });
});

describe("buildAdminUrlQueryFromPatch", () => {
  it("omits empty values", () => {
    const qs = buildAdminUrlQueryFromPatch({
      q: "rice",
      category: undefined,
      page: 2,
    });
    expect(qs).toBe("q=rice&page=2");
  });

  it("encodes unicode category", () => {
    const qs = buildAdminUrlQueryFromPatch({ category: "未分类" });
    expect(qs).toContain("category=");
    expect(decodeURIComponent(qs)).toContain("未分类");
  });
});
