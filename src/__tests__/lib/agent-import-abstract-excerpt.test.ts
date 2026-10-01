import { describe, expect, it, vi } from "vitest";
import type { ExternalLiteratureHit } from "@/contracts/literature";
import {
  fillMissingAbstractExcerpts,
  firstParagraphFromHtml,
} from "@/lib/agent/import-abstract-excerpt";

function hit(partial: Partial<ExternalLiteratureHit> & { id: string; title: string }): ExternalLiteratureHit {
  return {
    authors: [],
    source: "openalex",
    ...partial,
  };
}

describe("firstParagraphFromHtml", () => {
  it("skips scripts and keeps the first real paragraph", () => {
    const html = "<script>alert(1)</script><p>Hi</p><p>Biochar raises soil carbon in field trials across two seasons.</p>";
    expect(firstParagraphFromHtml(html)).toMatch(/Biochar raises soil/);
    expect(firstParagraphFromHtml(html)).not.toMatch(/alert/);
  });
});

describe("fillMissingAbstractExcerpts", () => {
  it("leaves hits that already have an abstract", async () => {
    const fetchImpl = vi.fn();
    const items = await fillMissingAbstractExcerpts(
      [hit({ id: "1", title: "A", abstract: "Already here and long enough.", doi: "10.1/x" })],
      { fetchImpl },
    );
    expect(items[0]?.abstract).toBe("Already here and long enough.");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not download a PDF when the only link is a pdf", async () => {
    const fetchImpl = vi.fn();
    const items = await fillMissingAbstractExcerpts(
      [hit({ id: "1", title: "A", openAccessUrl: "https://oa.example/paper.pdf" })],
      { fetchImpl },
    );
    expect(items[0]?.abstract).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("soft-fails when the landing page times out", async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal) {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      }
    }));
    const items = await fillMissingAbstractExcerpts(
      [hit({ id: "1", title: "A", doi: "10.1/slow" })],
      { fetchImpl, timeoutMs: 20 },
    );
    expect(items[0]?.abstract).toBeUndefined();
    expect(items[0]?.abstractExcerpt).toBeUndefined();
  });

  it("reads a clipped OpenAlex abstract and ignores the rest of the page", async () => {
    const long = "Biochar ".repeat(80);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes("openalex.org")) throw new Error("should not hit landing");
      return new Response(JSON.stringify({
        abstract_inverted_index: { [long.trim()]: [0] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const items = await fillMissingAbstractExcerpts(
      [hit({ id: "1", title: "A", doi: "10.1/x" })],
      { fetchImpl, timeoutMs: 1000 },
    );
    expect(items[0]?.abstractExcerpt).toBe(true);
    expect(items[0]?.abstract?.length).toBeLessThanOrEqual(480);
    expect(items[0]?.abstract?.startsWith("Biochar")).toBe(true);
  });

  it("clips an HTML landing page to the first paragraph", async () => {
    const fetchImpl = vi.fn(async () => new Response(
      "<html><p>Short.</p><p>This landing paragraph explains biochar effects on soil carbon in enough detail to judge the paper.</p></html>",
      { status: 200, headers: { "content-type": "text/html" } },
    ));
    const items = await fillMissingAbstractExcerpts(
      [hit({ id: "1", title: "A", openAccessUrl: "https://publisher.example/article" })],
      { fetchImpl, timeoutMs: 1000 },
    );
    expect(items[0]?.abstractExcerpt).toBe(true);
    expect(items[0]?.abstract).toMatch(/landing paragraph/);
    expect(items[0]?.abstract?.startsWith("Short")).toBe(false);
  });
});
