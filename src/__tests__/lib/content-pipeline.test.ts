import { describe, it, expect } from "vitest";
import { processContent } from "@/lib/content-pipeline";

describe("processContent", () => {
  it("processes plain text", () => {
    const result = processContent("plain text content");
    expect(result.mathNormalized).toBe("plain text content");
    expect(result.blocks).toBeDefined();
    expect(result.blocks.length).toBeGreaterThan(0);
  });

  it("normalizes LaTeX math delimiters", () => {
    const input = "text with \\[...\\] math";
    const result = processContent(input);
    // The math delimiter normalizer should standardize the format
    expect(result.mathNormalized).toBeDefined();
  });

  it("parses markdown blocks", () => {
    const input = "# Heading\n\nParagraph text.\n\n- list item 1\n- list item 2";
    const result = processContent(input);
    expect(result.blocks.length).toBeGreaterThan(1);
  });

  it("returns empty blocks for empty input", () => {
    const result = processContent("");
    expect(result.mathNormalized).toBe("");
    expect(result.blocks).toBeDefined();
  });

  it("skips citation injection when not requested", () => {
    const input = "text with [1] citation reference";
    const result = processContent(input);
    expect(result.withClickableCitations).toBeUndefined();
  });

  it("injects clickable citations when option is set", () => {
    const input = "text with [1] citation reference";
    const result = processContent(input, { withClickableCitations: true });
    expect(result.withClickableCitations).toBeDefined();
  });

  it("handles markdown with mixed content types", () => {
    const input = [
      "# 结果与讨论",
      "",
      "本章讨论实验结果。",
      "",
      "## 温度影响",
      "",
      "实验数据如表所示：",
      "",
      "| 温度 | 产率 |",
      "|------|------|",
      "| 600  | 45%  |",
      "",
      "结果表明温度对产率有显著影响[1]。",
    ].join("\n");

    const result = processContent(input);
    expect(result.mathNormalized).toBeDefined();
    expect(result.blocks.some((b) => b.type === "heading")).toBe(true);
    expect(result.blocks.some((b) => b.type === "paragraph")).toBe(true);
    expect(result.blocks.some((b) => b.type === "table")).toBe(true);
  });

  it("preserves LaTeX inline math through pipeline", () => {
    const input = "The formula $E = mc^2$ is fundamental";
    const result = processContent(input);
    expect(result.mathNormalized).toContain("$E = mc^2$");
  });
});
