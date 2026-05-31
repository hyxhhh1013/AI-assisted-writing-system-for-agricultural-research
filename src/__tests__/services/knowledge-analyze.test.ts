import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { analyzeKnowledgeStream } from "@/services/knowledge";

describe("analyzeKnowledgeStream", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams text and parses response headers", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("摘要"));
        controller.enqueue(encoder.encode("内容"));
        controller.close();
      },
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: new Headers({
        "X-Total-Chunks": "3",
        "X-Current-Chunk": "1",
        "X-Analysis-Mode": "chunk",
      }),
      body,
    } as Response);

    const chunks: string[] = [];
    const result = await analyzeKnowledgeStream(
      { filename: "paper.pdf", mode: "chunk", chunkIndex: 1 },
      (progress) => {
        chunks.push(progress.text);
      },
    );

    expect(fetch).toHaveBeenCalledWith("/api/knowledge/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "paper.pdf", mode: "chunk", chunkIndex: 1 }),
      signal: undefined,
    });
    expect(result.text).toBe("摘要内容");
    expect(result.meta).toEqual({ mode: "chunk", totalChunks: 3, currentChunk: 1 });
    expect(chunks.at(-1)).toBe("摘要内容");
  });

  it("throws API error message on failure", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "未找到该文献的索引内容，请先重建索引" }),
    } as Response);

    await expect(
      analyzeKnowledgeStream({ filename: "missing.pdf" }, () => undefined),
    ).rejects.toThrow("未找到该文献的索引内容，请先重建索引");
  });
});
