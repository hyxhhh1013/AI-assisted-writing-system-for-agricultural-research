import { describe, expect, it } from "vitest";
import {
  capOutlinePreview,
  countOutlineChars,
  outlineHeadingChips,
  outlineTextFromToolData,
  pickOutlineBody,
  splitOutlineBlocks,
} from "@/lib/agent/outline-review";

describe("outline review helpers", () => {
  it("prefers full outline over short preview in tool data", () => {
    const text = outlineTextFromToolData(
      { preview: "## 短", outline: "## 引言\n全文" },
      "fallback",
    );
    expect(text).toContain("全文");
  });

  it("picks the longer of checkpoint preview and project outline", () => {
    expect(pickOutlineBody("短", "# 标题\n更长的项目大纲")).toContain("项目大纲");
    expect(pickOutlineBody("# 检查点全文比较长的一段", "短")).toContain("检查点");
  });

  it("splits markdown headings for jump chips", () => {
    const blocks = splitOutlineBlocks(
      "# 总题\n导语\n## 摘要\n要点\n## 引言\n背景",
    );
    const chips = outlineHeadingChips(blocks);
    expect(chips.map((c) => c.title)).toEqual(["总题", "摘要", "引言"]);
    expect(countOutlineChars("# 总题\n导语")).toBeGreaterThan(0);
  });

  it("caps only extremely long previews", () => {
    const short = "大纲正文".repeat(10);
    expect(capOutlinePreview(short)).toBe(short.trim());
    const long = "章".repeat(24_010);
    const capped = capOutlinePreview(long);
    expect(capped.startsWith("章".repeat(24_000))).toBe(true);
    expect(capped).toContain("论证提纲");
  });
});
