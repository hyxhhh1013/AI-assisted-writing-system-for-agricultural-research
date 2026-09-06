import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  appendEmbeddings,
  isPrefixPreservingAppend,
  mergeCategoryChunks,
  pruneStage1Orphans,
  readEmbMeta,
  readFloat32LE,
  rewriteEmbById,
  writeCategoryIndexFiles,
  writeEmbeddingFile,
} from "../../../scripts/lib/index-emb-io.mjs";

function chunk(source: string, id: string, embedding?: number[]) {
  return {
    content: `text-${id}`,
    ...(embedding ? { embedding } : {}),
    metadata: { source, id, category: "测试" },
  };
}

describe("index-emb-io merge / orphan", () => {
  it("mergeCategoryChunks drops replaced sources and appends new chunks", () => {
    const existing = [chunk("old.pdf", "old#1"), chunk("new.pdf", "new#old"), chunk("keep.pdf", "keep#1")];
    const next = [chunk("new.pdf", "new#1"), chunk("new.pdf", "new#2")];
    const merged = mergeCategoryChunks(existing, next, new Set(["new.pdf"]));
    expect(merged.map((c) => c.metadata.id)).toEqual(["old#1", "keep#1", "new#1", "new#2"]);
  });

  it("isPrefixPreservingAppend detects pure append", () => {
    const old = [chunk("a.pdf", "a#1"), chunk("b.pdf", "b#1")];
    const appended = [...old, chunk("c.pdf", "c#1")];
    expect(isPrefixPreservingAppend(old, appended)).toBe(true);
    const replaced = [chunk("a.pdf", "a#1"), chunk("c.pdf", "c#1")];
    expect(isPrefixPreservingAppend(old, replaced)).toBe(false);
  });

  it("pruneStage1Orphans skips deletion on partial reindex", () => {
    const state = { "a.pdf": { mtime: 1 }, "b.pdf": { mtime: 2 } };
    const partial = pruneStage1Orphans(state, new Set(["a.pdf"]), { isPartial: true });
    expect(partial.removed).toEqual([]);
    expect(Object.keys(partial.state)).toEqual(["a.pdf", "b.pdf"]);

    const full = pruneStage1Orphans(state, new Set(["a.pdf"]), { isPartial: false });
    expect(full.removed).toEqual(["b.pdf"]);
    expect(Object.keys(full.state)).toEqual(["a.pdf"]);
  });
});

describe("index-emb-io embedding files", () => {
  it("skip-stage3 append keeps existing .emb and does not delete it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "idx-io-"));
    const indexPath = path.join(dir, "index_测试.json");
    const embPath = path.join(dir, "index_测试.emb");
    const oldChunks = [chunk("a.pdf", "a#1"), chunk("b.pdf", "b#1")];
    writeEmbeddingFile(embPath, [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
    ], 4);

    const merged = [...oldChunks, chunk("c.pdf", "c#1")];
    const result = writeCategoryIndexFiles({
      indexPath,
      embPath,
      chunks: merged,
      previousChunks: oldChunks,
      skipEmbRewrite: true,
    });

    expect(result.action).toBe("preserve-emb");
    expect(fs.existsSync(embPath)).toBe(true);
    const meta = readEmbMeta(embPath);
    expect(meta.count).toBe(2);
    expect(meta.dim).toBe(4);
    const json = JSON.parse(fs.readFileSync(indexPath, "utf-8")) as { metadata: { id: string } }[];
    expect(json.map((c) => c.metadata.id)).toEqual(["a#1", "b#1", "c#1"]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("rewriteEmbById copies kept vectors by id after a middle file is replaced", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "idx-io-"));
    const embPath = path.join(dir, "index_测试.emb");
    const oldChunks = [chunk("a.pdf", "a#1"), chunk("b.pdf", "b#1"), chunk("c.pdf", "c#1")];
    writeEmbeddingFile(embPath, [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
    ], 4);

    const merged = [chunk("a.pdf", "a#1"), chunk("c.pdf", "c#1"), chunk("b.pdf", "b#2")];
    const { written } = rewriteEmbById({
      oldEmbPath: embPath,
      newEmbPath: embPath,
      oldChunks,
      mergedChunks: merged,
      attachedEmbeddings: [null, null, [0, 0, 0, 1]],
    });
    expect(written).toBe(3);
    const buf = fs.readFileSync(embPath);
    expect(readFloat32LE(buf, 8, 4)).toEqual([1, 0, 0, 0]);
    expect(readFloat32LE(buf, 8 + 16, 4)).toEqual([0, 0, 1, 0]);
    expect(readFloat32LE(buf, 8 + 32, 4)).toEqual([0, 0, 0, 1]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("appendEmbeddings extends an existing .emb", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "idx-io-"));
    const embPath = path.join(dir, "index_测试.emb");
    writeEmbeddingFile(embPath, [[1, 0]], 2);
    appendEmbeddings(embPath, [[0, 1]], 2);
    expect(readEmbMeta(embPath).count).toBe(2);
    const buf = fs.readFileSync(embPath);
    expect(readFloat32LE(buf, 8 + 8, 2)).toEqual([0, 1]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("drops stale .emb when JSON order changes and no vectors can be copied", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "idx-io-"));
    const indexPath = path.join(dir, "index_测试.json");
    const embPath = path.join(dir, "index_测试.emb");
    writeEmbeddingFile(embPath, [[1, 0, 0, 0]], 4);
    const previous = [chunk("gone.pdf", "gone#1")];
    const merged = [chunk("new.pdf", "new#1")];
    const result = writeCategoryIndexFiles({
      indexPath,
      embPath,
      chunks: merged,
      previousChunks: previous,
      skipEmbRewrite: true,
    });
    expect(result.action).toBe("drop-stale-emb");
    expect(fs.existsSync(embPath)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
