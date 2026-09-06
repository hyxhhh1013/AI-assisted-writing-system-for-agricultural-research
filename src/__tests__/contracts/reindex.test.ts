import { describe, expect, it } from "vitest";
import {
  applyReindexEvent,
  buildKnowledgeIndexRequest,
  INITIAL_REINDEX_PROGRESS,
  KNOWLEDGE_INDEX_NAMED_FILE_CAP,
  reindexStepStatus,
  type ReindexProgressEvent,
  type ReindexRequest,
} from "@/contracts/reindex";

function parseReindexBody(body: unknown): ReindexRequest {
  if (body == null || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  const files = Array.isArray(record.files)
    ? record.files.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : undefined;
  return {
    files: files && files.length > 0 ? files : undefined,
    forceStage1: record.forceStage1 === true,
    forceStage3: record.forceStage3 === true,
    rechunk: record.rechunk === true,
  };
}

describe("ReindexRequest", () => {
  it("accepts single-file force stage1", () => {
    const parsed = parseReindexBody({
      files: ["paper.pdf"],
      forceStage1: true,
    });
    expect(parsed).toEqual({
      files: ["paper.pdf"],
      forceStage1: true,
      forceStage3: false,
      rechunk: false,
    });
  });

  it("ignores empty files array", () => {
    const parsed = parseReindexBody({ files: [], forceStage3: true });
    expect(parsed.files).toBeUndefined();
    expect(parsed.forceStage3).toBe(true);
  });
});

describe("buildKnowledgeIndexRequest", () => {
  it("keeps incremental job without flags", () => {
    expect(buildKnowledgeIndexRequest("incremental").request).toEqual({});
  });

  it("attaches files for rechunk", () => {
    expect(buildKnowledgeIndexRequest("rechunk", ["a.pdf"]).request).toEqual({
      rechunk: true,
      files: ["a.pdf"],
    });
  });

  it("rejects oversized named-file lists", () => {
    const files = Array.from({ length: KNOWLEDGE_INDEX_NAMED_FILE_CAP + 1 }, (_, i) => `p${i}.pdf`);
    const built = buildKnowledgeIndexRequest("forceParse", files);
    expect(built.error).toMatch(/最多/);
    expect(built.request).toEqual({ forceStage1: true });
  });
});

describe("applyReindexEvent", () => {
  it("keeps percent monotonic across write then embed", () => {
    let state = INITIAL_REINDEX_PROGRESS;
    const events: ReindexProgressEvent[] = [
      { type: "started" },
      { type: "scan", total: 2, unchanged: 0, changed: 2 },
      { type: "file", status: "processing", name: "a.pdf", index: 1, total: 2 },
      { type: "file", status: "done", name: "a.pdf", index: 1, total: 2, chunkCount: 3 },
      { type: "file", status: "processing", name: "b.pdf", index: 2, total: 2 },
      { type: "file", status: "done", name: "b.pdf", index: 2, total: 2, chunkCount: 4 },
      { type: "phase", phase: "pdf_done", chunkCount: 7 },
      { type: "phase", phase: "writing", detail: "增量写入 1 个分类索引" },
      { type: "save", phase: "category", category: "茶学", chunkCount: 7 },
      { type: "phase", phase: "sync", detail: "同步 2 篇书目到数据库" },
      { type: "embed", current: 0, total: 2, chunkCount: 7 },
      { type: "embed", current: 1, total: 2, chunkCount: 10 },
      { type: "embed", current: 2, total: 2, chunkCount: 10 },
      { type: "complete", totalChunks: 7, fileCount: 2, categoryCount: 1 },
    ];
    const percents: number[] = [];
    for (const event of events) {
      state = applyReindexEvent(state, event);
      percents.push(state.percent);
    }
    for (let i = 1; i < percents.length; i++) {
      expect(percents[i]).toBeGreaterThanOrEqual(percents[i - 1]);
    }
    expect(state.pipelineStage).toBe("done");
    expect(state.percent).toBe(100);
    expect(reindexStepStatus("parse", state)).toBe("done");
    expect(reindexStepStatus("embed", state)).toBe("done");
  });

  it("does not log every unchanged file", () => {
    let state = applyReindexEvent(INITIAL_REINDEX_PROGRESS, { type: "started" });
    state = applyReindexEvent(state, {
      type: "file",
      status: "unchanged",
      name: "old.pdf",
      index: 1,
      total: 1,
    });
    expect(state.logs.some((line) => line.includes("old.pdf"))).toBe(false);
    expect(state.processedFiles).toBe(1);
  });
});
