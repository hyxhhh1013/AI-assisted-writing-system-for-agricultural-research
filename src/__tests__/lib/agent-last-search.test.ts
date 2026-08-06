import { describe, expect, it, beforeEach } from "vitest";
import {
  storeLastAgentSearch,
  resolveAgentHitIndices,
  clearLastAgentSearch,
} from "@/lib/agent/last-search";

const hits = [
  { id: "1", title: "A", authors: [], year: 2020, journal: "J", source: "openalex" as const },
  { id: "2", title: "B", authors: [], year: 2021, journal: "J", source: "openalex" as const },
  { id: "3", title: "C", authors: [], year: 2022, journal: "J", source: "openalex" as const },
];

describe("last-search hitIndices", () => {
  beforeEach(() => clearLastAgentSearch("u1"));

  it("returns empty when no hitIndices", () => {
    expect(resolveAgentHitIndices(undefined, "u1")).toEqual({ hits: [], indices: [] });
    expect(resolveAgentHitIndices("", "u1")).toEqual({ hits: [], indices: [] });
  });

  it("resolves 1-based indices from stored search", () => {
    storeLastAgentSearch("u1", hits);
    const r = resolveAgentHitIndices("[1,3]", "u1");
    expect("hits" in r).toBe(true);
    if ("hits" in r) {
      expect(r.hits.map((h) => h.id)).toEqual(["1", "3"]);
      expect(r.indices).toEqual([1, 3]);
    }
  });

  it("parses comma-separated string", () => {
    storeLastAgentSearch("u1", hits);
    const r = resolveAgentHitIndices("2,3", "u1");
    if ("hits" in r) expect(r.hits.map((h) => h.id)).toEqual(["2", "3"]);
  });

  it("keeps in-range hits and drops out-of-range", () => {
    storeLastAgentSearch("u1", hits);
    const r = resolveAgentHitIndices("[1,9]", "u1");
    if ("hits" in r) expect(r.hits.map((h) => h.id)).toEqual(["1"]);
  });

  it("errors when all indices out of range", () => {
    storeLastAgentSearch("u1", hits);
    expect("error" in resolveAgentHitIndices("[9,10]", "u1")).toBe(true);
  });
});
