import { describe, expect, it } from "vitest";
import {
  replaceMarkdownImageUrl,
  stripMarkdownImagesByUrl,
} from "@/lib/agent/chart-markdown";

describe("chart-markdown", () => {
  const urlA = "/api/charts/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png";
  const urlB = "/api/charts/11111111-2222-3333-4444-555555555555.png";

  it("strips markdown images by url", () => {
    const content = `前文\n\n![图1](${urlA})\n\n后文 ![别的](${urlB})`;
    const { next, removed } = stripMarkdownImagesByUrl(content, urlA);
    expect(removed).toBe(1);
    expect(next).not.toContain(urlA);
    expect(next).toContain(urlB);
    expect(next).toContain("前文");
  });

  it("replaces image url in place (keeps surrounding text)", () => {
    const content = `说明\n\n![旧标题](${urlA})\n\n继续`;
    const { next, replaced } = replaceMarkdownImageUrl(content, urlA, urlB, "新标题");
    expect(replaced).toBe(1);
    expect(next).toBe(`说明\n\n![新标题](${urlB})\n\n继续`);
  });

  it("replace returns 0 when old url absent", () => {
    const content = `无图段落`;
    const { next, replaced } = replaceMarkdownImageUrl(content, urlA, urlB);
    expect(replaced).toBe(0);
    expect(next).toBe(content);
  });
});
