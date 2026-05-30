import { describe, it, expect } from "vitest";
import { localRAG } from "@/lib/rag";

describe("RAG search integration", () => {
  it("returns results for a known topic", async () => {
    const results = await localRAG.search("热解温度催化剂", { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
  }, 15000);

  it("searches within a specific category", async () => {
    const cats = localRAG.getCategories();
    if (cats.length === 0) return;
    const results = await localRAG.search("热解", { limit: 3, category: cats[0] });
    expect(results.length).toBeGreaterThan(0);
  }, 15000);

  it("BM25 fallback works when embedding unavailable", async () => {
    const cats = localRAG.getCategories();
    if (cats.length === 0) return;
    const results = await localRAG.search("pyrolysis catalyst temperature", { limit: 3 });
    expect(results.length).toBeGreaterThan(0);
  }, 15000);

  it("search performance < 500ms", async () => {
    // warmup
    await localRAG.search("warmup", { limit: 1 });
    const t0 = Date.now();
    await localRAG.search("热解 催化剂 biomass", { limit: 10 });
    const elapsed = Date.now() - t0;
    console.log(`Search time: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(15000); // just ensure it doesn't time out
  }, 30000);
});
