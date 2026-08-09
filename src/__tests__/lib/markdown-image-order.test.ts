import { describe, expect, it } from "vitest";
import {
  listMarkdownImages,
  moveMarkdownImage,
  moveMarkdownImageToCursor,
  moveMarkdownImageToEnd,
  moveMarkdownImageToStart,
} from "@/lib/markdown-image-order";

const SAMPLE =
  "前言\n\n![图A](/api/charts/a.png)\n\n中间段落\n\n![图B](/api/charts/b.png)\n\n结尾";

describe("markdown-image-order", () => {
  it("lists images in order", () => {
    const hits = listMarkdownImages(SAMPLE);
    expect(hits).toHaveLength(2);
    expect(hits[0]?.alt).toBe("图A");
    expect(hits[1]?.src).toContain("b.png");
  });

  it("moves image down / up", () => {
    const down = moveMarkdownImage(SAMPLE, 0, 1);
    const imgs = listMarkdownImages(down);
    expect(imgs[0]?.alt).toBe("图B");
    expect(imgs[1]?.alt).toBe("图A");
    const up = moveMarkdownImage(down, 1, -1);
    expect(listMarkdownImages(up)[0]?.alt).toBe("图A");
  });

  it("moves to end / start", () => {
    const end = moveMarkdownImageToEnd(SAMPLE, 0);
    expect(end.trimEnd().endsWith("![图A](/api/charts/a.png)")).toBe(true);
    const start = moveMarkdownImageToStart(SAMPLE, 1);
    expect(start.startsWith("![图B](/api/charts/b.png)")).toBe(true);
  });

  it("moves to cursor", () => {
    const cursor = SAMPLE.indexOf("中间段落");
    const next = moveMarkdownImageToCursor(SAMPLE, 1, cursor);
    expect(next.indexOf("![图B](/api/charts/b.png)")).toBeLessThan(
      next.indexOf("中间段落"),
    );
  });
});
