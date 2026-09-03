import { describe, expect, it } from "vitest";
import {
  extractOutlineHeadings,
  looksLikeFullPaper,
  pickOutlineSkeleton,
  resolveOutlineFramework,
} from "@/lib/agent/outline-from-attachment";
import { getDefaultUserSkeleton } from "@/lib/outline-skeleton";

describe("extractOutlineHeadings", () => {
  it("reads markdown and numbered first-level titles", () => {
    const text = [
      "# 论文框架",
      "## 引言",
      "### 背景",
      "## 材料与方法",
      "1.1 不该进一级",
      "## 结果与分析",
      "2. 结论",
    ].join("\n");
    expect(extractOutlineHeadings(text)).toEqual([
      "引言",
      "材料与方法",
      "结果与分析",
      "结论",
    ]);
  });

  it("reads 一、 / 第一章 style", () => {
    const text = ["一、选题背景", "二、技术路线", "三、预期结果"].join("\n");
    expect(extractOutlineHeadings(text)).toEqual([
      "选题背景",
      "技术路线",
      "预期结果",
    ]);
  });
});

describe("resolveOutlineFramework", () => {
  it("locks filename-matched short outline", () => {
    const r = resolveOutlineFramework({
      attachments: [
        {
          id: "a1",
          originalName: "部分大纲.md",
          status: "ready",
          extractedText: ["# 框架", "## 摘要", "## 引言", "## 结论与展望"].join("\n"),
        },
      ],
    });
    expect(r.status).toBe("used");
    if (r.status === "used") {
      expect(r.framework.source).toBe("filename");
      expect(r.framework.headings).toEqual(["摘要", "引言", "结论与展望"]);
    }
  });

  it("rejects a long paper PDF without outline-like name", () => {
    const body = [
      "Abstract\nThis paper studies biochar.\n",
      "References\n[1] doi.org/10.1/xxx\n",
      "更多正文。".repeat(4000),
    ].join("");
    expect(looksLikeFullPaper(body)).toBe(true);
    const r = resolveOutlineFramework({
      attachments: [
        {
          id: "p1",
          originalName: "Zhang2024.pdf",
          status: "ready",
          extractedText: body,
        },
      ],
    });
    expect(r.status).toBe("none");
  });

  it("errors when specified attachment is still extracting", () => {
    const r = resolveOutlineFramework({
      attachmentId: "x1",
      attachments: [
        {
          id: "x1",
          originalName: "大纲.docx",
          status: "extracting",
          extractedText: "",
        },
      ],
    });
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.error).toMatch(/仍在提取/);
  });

  it("does not use csv as framework", () => {
    const r = resolveOutlineFramework({
      attachments: [
        {
          id: "t1",
          originalName: "yield.csv",
          status: "ready",
          extractedText: "| a | b |\n| 1 | 2 |",
        },
      ],
    });
    expect(r.status).toBe("none");
  });
});

describe("pickOutlineSkeleton", () => {
  it("attachment headings win over default and param skeleton", () => {
    const picked = pickOutlineSkeleton({
      framework: {
        attachmentId: "a1",
        fileName: "框架.md",
        headings: ["摘要", "机理进展", "争议与空白", "展望"],
        excerpt: "## 摘要",
        source: "filename",
      },
      paramSkeleton: ["摘要", "引言", "材料与方法", "结论"],
      defaultSkeleton: getDefaultUserSkeleton("research"),
    });
    expect(picked.lockedByAttachment).toBe(true);
    expect(picked.skeleton).toEqual(["摘要", "机理进展", "争议与空白", "展望"]);
  });

  it("falls back to param skeleton when attachment has too few headings", () => {
    const picked = pickOutlineSkeleton({
      framework: {
        attachmentId: "a1",
        fileName: "框架.md",
        headings: ["引言"],
        excerpt: "引言……",
        source: "filename",
      },
      paramSkeleton: ["摘要", "引言", "结论"],
      defaultSkeleton: getDefaultUserSkeleton("review"),
    });
    expect(picked.lockedByAttachment).toBe(false);
    expect(picked.skeleton).toEqual(["摘要", "引言", "结论"]);
  });
});
