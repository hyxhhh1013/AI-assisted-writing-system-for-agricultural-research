// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "@/lib/sanitize-html";

describe("sanitizeHtml", () => {
  it("strips onerror from injected img", () => {
    const out = sanitizeHtml('<p>x<img src="x" onerror="alert(1)">y</p>');
    expect(out.toLowerCase()).not.toContain("onerror");
    expect(out.toLowerCase()).not.toContain("alert(1)");
  });

  it("strips script tags", () => {
    const out = sanitizeHtml("<div>ok<script>alert(1)</script></div>");
    expect(out.toLowerCase()).not.toContain("<script");
  });

  it("keeps table markup", () => {
    const src = '<table class="three-line-table"><caption>产量</caption><tr><td>1.0</td></tr></table>';
    const out = sanitizeHtml(src);
    expect(out).toContain("three-line-table");
    expect(out).toContain("产量");
  });
});
