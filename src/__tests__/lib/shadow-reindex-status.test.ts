import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readShadowView, summarizeShadowDocument } from "@/lib/shadow-reindex-status";

describe("shadow rebuild status", () => {
  it("shows progress for the running category and lists written files", () => {
    const root = mkdtempSync(path.join(tmpdir(), "shadow-status-"));
    mkdirSync(path.join(root, "chunks", "热化学"), { recursive: true });
    writeFileSync(path.join(root, "chunks", "热化学", "a.pdf.json"), "{}");
    writeFileSync(path.join(root, "progress.json"), JSON.stringify({
      category: "热化学",
      fileCount: 4,
      written: 1,
      lastFile: "a.pdf",
      finished: false,
      updatedAt: "2026-10-07T15:00:00.000Z",
    }));

    const running = readShadowView(root, "热化学", true);
    expect(running.running).toBe(true);
    expect(running.written).toBe(1);
    expect(running.files).toEqual(["a.pdf"]);

    const other = readShadowView(root, "土壤", true);
    expect(other.running).toBe(false);
    expect(other.activeCategory).toBe("热化学");
    expect(other.files).toEqual([]);
  });

  it("treats a finished job as idle even if the pid is still recorded", () => {
    const root = mkdtempSync(path.join(tmpdir(), "shadow-status-"));
    writeFileSync(path.join(root, "progress.json"), JSON.stringify({
      category: "热化学",
      fileCount: 2,
      written: 2,
      lastFile: null,
      finished: true,
    }));
    const view = readShadowView(root, "热化学", true);
    expect(view.running).toBe(false);
    expect(view.finished).toBe(true);
  });

  it("previews new reading order ahead of a kept-old page", () => {
    const preview = summarizeShadowDocument({
      source: "paper.pdf",
      category: "热化学",
      builtAt: "2026-10-07T15:00:00.000Z",
      crossColumnPages: [4],
      chunks: [
        { content: "old left-right mix", metadata: { pageStart: 4, keptOld: true } },
        { content: "Left column sentence. Right column follows.", metadata: { pageStart: 2, keptOld: false } },
      ],
    });
    expect(preview.chunkCount).toBe(2);
    expect(preview.keptOldChunks).toBe(1);
    expect(preview.crossColumnPages).toEqual([4]);
    expect(preview.samples[0]?.text).toContain("Left column");
    expect(preview.samples[0]?.keptOld).toBe(false);
    expect(preview.samples.some((sample) => sample.keptOld)).toBe(true);
  });
});
