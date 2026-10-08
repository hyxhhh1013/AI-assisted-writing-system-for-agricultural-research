import { describe, expect, it } from "vitest";
import {
  applyKnowledgeListUrl,
  knowledgeListFilterKey,
  knowledgeListHasBibFilters,
  readKnowledgeListUrl,
} from "@/lib/knowledge-list-url";

describe("readKnowledgeListUrl", () => {
  it("restores page, category, and bib filters", () => {
    const state = readKnowledgeListUrl(
      new URLSearchParams("page=4&category=荧光粉&q=biochar&journal=Ceramics&index=unindexed&doi=missing&type=semantic"),
    );
    expect(state).toEqual({
      page: 4,
      q: "biochar",
      category: "荧光粉",
      searchType: "semantic",
      journal: "Ceramics",
      indexStatus: "unindexed",
      doi: "missing",
    });
    expect(knowledgeListHasBibFilters(state)).toBe(true);
  });

  it("falls back when page or filters are invalid", () => {
    const state = readKnowledgeListUrl(new URLSearchParams("page=0&index=nope&doi=nope"));
    expect(state.page).toBe(1);
    expect(state.indexStatus).toBe("all");
    expect(state.doi).toBe("all");
    expect(state.category).toBe("全部");
  });
});

describe("applyKnowledgeListUrl", () => {
  it("omits defaults and keeps unrelated params", () => {
    const current = new URLSearchParams("projectId=p1&page=2");
    const qs = applyKnowledgeListUrl(current, {
      page: 1,
      q: "",
      category: "全部",
      searchType: "name",
      journal: "",
      indexStatus: "all",
      doi: "all",
    });
    expect(qs).toBe("projectId=p1");
  });

  it("writes the current page without dropping projectId", () => {
    const qs = applyKnowledgeListUrl(new URLSearchParams("projectId=p1"), {
      page: 3,
      q: "炭",
      category: "茶学",
      searchType: "name",
      journal: "",
      indexStatus: "ready",
      doi: "all",
    });
    const params = new URLSearchParams(qs);
    expect(params.get("projectId")).toBe("p1");
    expect(params.get("page")).toBe("3");
    expect(params.get("q")).toBe("炭");
    expect(params.get("category")).toBe("茶学");
    expect(params.get("index")).toBe("ready");
    expect(params.get("type")).toBeNull();
  });
});

describe("knowledgeListFilterKey", () => {
  it("ignores page so paging does not look like a new filter", () => {
    const base = {
      q: "",
      category: "全部",
      searchType: "name" as const,
      journal: "",
      indexStatus: "all" as const,
      doi: "all" as const,
    };
    expect(knowledgeListFilterKey(base)).toBe(knowledgeListFilterKey({ ...base }));
    expect(knowledgeListFilterKey(base)).not.toBe(knowledgeListFilterKey({ ...base, category: "茶学" }));
  });
});
