import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/** 与 scripts/convert-index-to-binary.mjs 相同的 .emb 头格式 */
function writeTestEmb(filePath: string, embeddings: number[][], dim: number) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(1, 0);
  header.writeUInt32LE(dim, 4);
  const parts = [header];
  for (const emb of embeddings) {
    const buf = Buffer.allocUnsafe(dim * 4);
    for (let i = 0; i < dim; i++) buf.writeFloatLE(emb[i], i * 4);
    parts.push(buf);
  }
  fs.writeFileSync(filePath, Buffer.concat(parts));
}

describe("RAG .emb binary format", () => {
  it("header + float32 payload size matches chunk count", () => {
    const dim = 4;
    const embeddings = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
    ];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "emb-test-"));
    const embPath = path.join(dir, "index_test.emb");
    writeTestEmb(embPath, embeddings, dim);

    const buf = fs.readFileSync(embPath);
    expect(buf.readUInt32LE(0)).toBe(1);
    expect(buf.readUInt32LE(4)).toBe(dim);
    expect(buf.length).toBe(8 + embeddings.length * dim * 4);

    const v0 = buf.readFloatLE(8);
    expect(v0).toBeCloseTo(1, 5);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
