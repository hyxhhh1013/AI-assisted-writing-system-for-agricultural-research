import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildShadowPages,
  chunkShadowPages,
  selectShadowFiles,
  shadowChunkPath,
  writeShadowDocument,
} from "../../../scripts/lib/shadow-index.mjs";

function item(str: string, x: number, y: number, width: number) {
  return { str, transform: [1, 0, 0, 1, x, y], width };
}

describe("shadow index selection", () => {
  const files = [
    { name: "a.pdf", category: "热化学", path: "papers/热化学/a.pdf" },
    { name: "b.pdf", category: "热化学", path: "papers/热化学/b.pdf" },
    { name: "c.pdf", category: "茶学", path: "papers/茶学/c.pdf" },
  ];

  it("requires a file list or one category", () => {
    expect(() => selectShadowFiles(files, {})).toThrow(/一个分类/);
  });

  it("refuses two categories in one run", () => {
    expect(() => selectShadowFiles(files, { names: ["a.pdf", "c.pdf"] })).toThrow(/一个分类/);
  });

  it("keeps a single category", () => {
    expect(selectShadowFiles(files, { category: "热化学" }).map((file: { name: string }) => file.name)).toEqual(["a.pdf", "b.pdf"]);
  });
});

describe("shadow pages", () => {
  it("reads the left column before the right and does not keep the old mixed line", () => {
    const pages = buildShadowPages([
      {
        page: 1,
        items: [
          item("The soil pH", 40, 700, 80),
          item("increased after biochar.", 40, 680, 140),
          item("Yield did not", 340, 700, 90),
          item("change this year.", 340, 680, 110),
        ],
      },
    ]);
    expect(pages[0]?.keptOld).toBe(false);
    expect(pages[0]?.text).toBe(
      ["The soil pH", "increased after biochar.", "Yield did not", "change this year."].join("\n"),
    );
    const chunks = chunkShadowPages(pages, "a.pdf", "热化学");
    expect(chunks[0]?.content).toContain("The soil pH increased after biochar.");
    expect(chunks[0]?.content.indexOf("The soil pH")).toBeLessThan(chunks[0]?.content.indexOf("Yield did not"));
    expect(chunks[0]?.metadata.shadow).toBe(true);
  });

  it("keeps the legacy text when a line crosses the gutter", () => {
    const pages = buildShadowPages([
      {
        page: 2,
        legacyText: "旧页正文",
        items: [
          item("Left column stays.", 40, 700, 110),
          item("Right column stays.", 340, 700, 120),
          item("bridges the gutter badly", 90, 640, 280),
        ],
      },
    ]);
    expect(pages[0]?.keptOld).toBe(true);
    expect(pages[0]?.text).toBe("旧页正文");
  });
});

describe("shadow output path", () => {
  it("refuses a category path that escapes the shadow directory", () => {
    expect(() => shadowChunkPath("/tmp/shadow", "../热化学", "a.pdf")).toThrow(/分类名/);
    expect(() => shadowChunkPath("/tmp/shadow", "热化学", "../a.pdf")).toThrow(/文献名/);
  });

  it("writes only inside the shadow directory", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rag-shadow-"));
    const live = path.join(dir, "index_热化学.json");
    const target = writeShadowDocument(
      path.join(dir, "shadow"),
      { name: "a.pdf", category: "热化学" },
      { chunks: [{ content: "The soil pH increased after biochar." }] },
    );
    expect(target.includes(`${path.sep}shadow${path.sep}`)).toBe(true);
    expect(existsSync(live)).toBe(false);
    const saved = JSON.parse(readFileSync(target, "utf8")) as { chunks: { content: string }[] };
    expect(saved.chunks[0]?.content).toContain("biochar");
  });
});

describe("shadow rebuild command", () => {
  it("does not wait for the night window and refuses an empty library", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rag-shadow-empty-"));
    try {
      execFileSync(process.execPath, ["scripts/shadow-reading-order.mjs", "--category=热化学"], {
        cwd: process.cwd(),
        env: { ...process.env, RAG_ARTICLES_DIR: dir, RAG_PROP_NOW: "2026-10-07T14:00:00.000Z" },
        encoding: "utf8",
      });
      throw new Error("空库应当失败");
    } catch (err) {
      const failed = err as { status?: number; stdout?: string; stderr?: string };
      expect(failed.status).toBe(1);
      const text = `${failed.stdout ?? ""}${failed.stderr ?? ""}`;
      expect(text).toContain("没有要处理的 PDF");
      expect(text).not.toContain("深夜窗口");
    }
  });
});
