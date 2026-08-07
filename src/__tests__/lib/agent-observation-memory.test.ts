import { describe, expect, it } from "vitest";
import { formatToolObservationForLlm } from "@/lib/agent/observation-memory";

describe("formatToolObservationForLlm", () => {
  it("keeps search hit excerpts for later reasoning", () => {
    const text = formatToolObservationForLlm("search_knowledge", {
      success: true,
      summary: "命中 2 条",
      data: {
        hits: [
          { citation: "Smith 2020", excerpt: "biochar increased yield by 12%" },
          { citation: "Li 2021", excerpt: "salt stress mitigation via carbon" },
        ],
      },
    });
    expect(text).toContain("【证据摘录】");
    expect(text).toContain("biochar increased yield");
    expect(text).toContain("Smith 2020");
  });

  it("formats failures without inventing evidence", () => {
    const text = formatToolObservationForLlm("write_section", {
      success: false,
      error: "需要大纲",
    });
    expect(text).toContain("失败");
    expect(text).toContain("需要大纲");
    expect(text).not.toContain("【证据摘录】");
  });
});

describe("formatToolObservationForLlm — write 工具 evidence", () => {
  it("write_section 结果包含正文与元数据（不再只截断 JSON）", () => {
    const draft = "引言正文".repeat(100); // 300 字
    const out = formatToolObservationForLlm("write_section", {
      success: true,
      summary: "已生成并写回 introduction（300 字）",
      data: {
        section: "introduction",
        draft,
        charCount: 300,
        newReferences: [],
        pipelineMode: "full",
        verification: "核查通过",
        issueCount: 0,
        citationWarnings: 0,
        persisted: { sectionKey: "introduction", referencesAdded: 0 },
      },
    });
    expect(out).toContain("target=introduction");
    expect(out).toContain("字数≈300");
    expect(out).toContain("mode=full");
    expect(out).toContain("persisted=true");
    expect(out).toContain(draft);
  });

  it("refine_content 结果含 draft", () => {
    const out = formatToolObservationForLlm("refine_content", {
      success: true,
      summary: "已润色",
      data: { section: "methods", draft: "方法正文", charCount: 4, persisted: null },
    });
    expect(out).toContain("方法正文");
    expect(out).toContain("persisted=false");
  });

  it("长正文截断到 7500 而非 2800", () => {
    const draft = "长".repeat(9000); // 9000 字
    const out = formatToolObservationForLlm("write_section", {
      success: true,
      summary: "已生成长正文",
      data: { section: "results", draft, charCount: 9000, persisted: true },
    });
    // 证据区包含 meta 行 + 换行 + 正文，整段应远大于旧上限 2800
    expect(out.length).toBeGreaterThan(2800);
    expect(out.length).toBeLessThanOrEqual(7500 + 200);
    expect(out.endsWith("…")).toBe(true);
  });
});
