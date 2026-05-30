import { describe, it, expect } from "vitest";
import {
  parseOutline,
  buildExpansionContext,
  deduplicateParagraphs,
  mapToIMRADSection,
  cleanDraftArtifacts,
  buildOutlineTasks,
  countProjectFigures,
  cleanMarkdownArtifacts,
} from "@/lib/utils";

// ==================== parseOutline ====================

describe("parseOutline", () => {
  it("returns empty array for empty input", () => {
    expect(parseOutline("")).toEqual([]);
  });

  it("parses Markdown hash headings", () => {
    const md = "# 引言\n这是引言内容\n## 方法\n这是方法内容";
    const sections = parseOutline(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe("引言");
    expect(sections[0].level).toBe(1);
    expect(sections[0].content).toContain("这是引言内容");
    expect(sections[1].title).toBe("方法");
    expect(sections[1].level).toBe(2);
  });

  it("parses numbered headings (1.1 / 2.1)", () => {
    const md = "1 绪论\n绪论内容\n1.1 研究背景\n背景内容\n2 实验方法\n实验内容";
    const sections = parseOutline(md);
    expect(sections).toHaveLength(3);
    expect(sections[0].title).toBe("绪论");
    expect(sections[1].title).toBe("研究背景");
    expect(sections[1].level).toBe(2);
    expect(sections[2].title).toBe("实验方法");
  });

  it("parses Chinese-numbered headings", () => {
    const md = "一、绪论\n内容\n二、方法\n方法内容";
    const sections = parseOutline(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe("绪论");
    expect(sections[1].title).toBe("方法");
  });

  it("parses parenthetical numbered headings", () => {
    const md = "(1) 摘要\n摘要内容\n(2) 关键词\n关键词内容";
    const sections = parseOutline(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].level).toBe(2);
  });

  it("skips headings shorter than 2 chars and treats as content", () => {
    const md = "## A\n内容第一段\n## 有效标题\n内容第二段";
    const sections = parseOutline(md);
    // "A" is too short, should be treated as content of previous or skipped
    const titles = sections.map((s) => s.title);
    expect(titles.every((t) => t.length >= 2)).toBe(true);
  });

  it("assigns deterministic IDs via stableHash", () => {
    const first = parseOutline("## 引言\n内容");
    const second = parseOutline("## 引言\n内容");
    expect(first[0].id).toBe(second[0].id);
  });

  it("builds fullPath from heading hierarchy", () => {
    const md = "# 第一章\n## 1.1 背景\n内容";
    const sections = parseOutline(md);
    expect(sections[1].fullPath).toBe("第一章 > 1.1 背景");
  });

  it("falls back to paragraph mode when no headings detected", () => {
    const md = "第一段足够长的内容需要超过二十个字符才能被识别为段落。\n\n第二段也是足够长的内容需要超过二十个字符。";
    const sections = parseOutline(md);
    expect(sections.length).toBeGreaterThan(0);
  });
});

// ==================== mapToIMRADSection ====================

describe("mapToIMRADSection", () => {
  it("maps 摘要 to abstract", () => {
    expect(mapToIMRADSection("摘要")).toBe("abstract");
  });

  it("maps 引言/前言 to introduction", () => {
    expect(mapToIMRADSection("引言")).toBe("introduction");
    expect(mapToIMRADSection("研究背景")).toBe("introduction");
  });

  it("maps 实验/制备/表征 to methods", () => {
    expect(mapToIMRADSection("实验部分")).toBe("methods");
    expect(mapToIMRADSection("材料与制备")).toBe("methods");
    expect(mapToIMRADSection("表征分析")).toBe("methods");
  });

  it("maps 结果/讨论/分析 to results", () => {
    expect(mapToIMRADSection("结果与讨论")).toBe("results");
    expect(mapToIMRADSection("性能分析")).toBe("results");
    expect(mapToIMRADSection("机理研究")).toBe("results");
  });

  it("maps 结论/总结/展望 to conclusion", () => {
    expect(mapToIMRADSection("结论")).toBe("conclusion");
    expect(mapToIMRADSection("总结与展望")).toBe("conclusion");
  });

  it("falls back to introduction for unrecognized headings", () => {
    expect(mapToIMRADSection("其他乱七八糟的东西")).toBe("introduction");
  });
});

// ==================== buildExpansionContext ====================

describe("buildExpansionContext", () => {
  it("includes section title and parent label", () => {
    const section = { id: "s1", title: "温度影响", level: 2, content: "", fullPath: "结果与讨论 > 温度影响" };
    const ctx = buildExpansionContext(section, []);
    expect(ctx).toContain("温度影响");
    expect(ctx).toContain("结果与讨论");
  });

  it("includes section content as key points", () => {
    const section = { id: "s1", title: "测试", level: 2, content: "分析温度对产率的影响", fullPath: "方法 > 测试" };
    const ctx = buildExpansionContext(section, []);
    expect(ctx).toContain("分析温度对产率的影响");
  });

  it("lists sibling sections", () => {
    const target = { id: "s2", title: "B", level: 2, content: "", fullPath: "方法 > B" };
    const sibling = { id: "s1", title: "A", level: 2, content: "", fullPath: "方法 > A" };
    const ctx = buildExpansionContext(target, [target, sibling]);
    expect(ctx).toContain("同级子节");
    expect(ctx).toContain("A");
  });

  it("includes outline text when provided", () => {
    const section = { id: "s1", title: "测试", level: 1, content: "", fullPath: "测试" };
    const ctx = buildExpansionContext(section, [], "# 大纲\n内容概要");
    expect(ctx).toContain("论文大纲概览");
  });
});

// ==================== buildOutlineTasks ====================

describe("buildOutlineTasks", () => {
  it("converts outline text to tasks", () => {
    const tasks = buildOutlineTasks("## 引言\n内容\n## 方法\n方法内容");
    expect(tasks).toHaveLength(2);
    expect(tasks[0].sectionKey).toBeDefined();
    expect(tasks[0].fullPath).toBeDefined();
  });
});

// ==================== deduplicateParagraphs ====================

describe("deduplicateParagraphs", () => {
  it("removes exact duplicate paragraphs", () => {
    const longPara = "这是一个非常长的学术内容段落包含了大量的学术信息和技术细节描述用于测试去重功能这个段落需要足够长才能触发去重检测机制至少需要六十个字符以上才能参与去重比对";
    const text = longPara + "\n\n" + longPara;
    const result = deduplicateParagraphs(text);
    const paragraphs = result.split("\n\n");
    expect(paragraphs).toHaveLength(1);
  });

  it("keeps different paragraphs", () => {
    const text = "这是第一段足够长的学术内容需要超过六十个字符才能参与去重检测这是第一段足够长的内容。\n\n这是完全不同的第二段内容包含了不一样的信息和论述这是完全不同的第二段内容。";
    const result = deduplicateParagraphs(text);
    const paragraphs = result.split("\n\n");
    expect(paragraphs).toHaveLength(2);
  });

  it("skips paragraphs shorter than minChars", () => {
    const text = "短。\n\n这是一段足够长的内容需要超过六十个字符这是足够长的内容这是足够长的内容这是足够长的内容。\n\n短。";
    const result = deduplicateParagraphs(text);
    // Short paragraphs are kept regardless (they're not deduped)
    expect(result).toContain("短");
  });

  it("returns empty string for empty input", () => {
    expect(deduplicateParagraphs("")).toBe("");
  });

  it("detects highly overlapping long paragraphs", () => {
    // Need >120 normalized chars for overlap detection to activate
    // Each Chinese char = 1 UTF-16 unit; need 150+ chars for margin after normalization strips punctuation
    const base = "这是一个非常长的学术段落包含了大量的学术信息和技术细节描述用于测试重叠检测功能这个段落需要足够长才能触发去重重叠检测机制至少需要一百二十个字符以上就是需要写很多内容所以我们还要继续添加更多的文字来确保这个段落的长度足够触发重叠检测的逻辑判断需要超过一百二十个归一化后的字符";
    const variant = base + "最后加上一句不同的话使得两个段落略有差异而不会完全相同。";
    const text = [base, variant].join("\n\n");
    const result = deduplicateParagraphs(text);
    const paragraphs = result.split("\n\n");
    expect(paragraphs).toHaveLength(1);
  });
});

// ==================== cleanDraftArtifacts ====================

describe("cleanDraftArtifacts", () => {
  it('replaces "Lab Member" placeholder', () => {
    const result = cleanDraftArtifacts("作者：Lab Member");
    expect(result).not.toContain("Lab Member");
    expect(result).toContain("作者信息待填写");
  });

  it("removes illustration suggestion markers", () => {
    const text = "> 📊 **建议插图**：此处应添加温度曲线图\n正文内容";
    const result = cleanDraftArtifacts(text);
    expect(result).not.toContain("建议插图");
  });

  it("removes system auto-marking hints", () => {
    const text = "> *此处为系统根据上下文自动标记的图表位置*\n正文";
    const result = cleanDraftArtifacts(text);
    expect(result).not.toContain("自动标记");
  });
});

// ==================== cleanMarkdownArtifacts ====================

describe("cleanMarkdownArtifacts", () => {
  it("strips blockquote markers", () => {
    const result = cleanMarkdownArtifacts("> 这是引用内容");
    expect(result).not.toContain(">");
    expect(result).toContain("这是引用内容");
  });

  it("removes chart emoji artifacts", () => {
    const result = cleanMarkdownArtifacts("📊 数据如图 📈 所示");
    expect(result).not.toContain("📊");
    expect(result).not.toContain("📈");
  });

  it("removes citation placeholder", () => {
    const result = cleanMarkdownArtifacts("某种说法[引用?]需要清理");
    expect(result).not.toContain("[引用?]");
  });
});

// ==================== countProjectFigures ====================

describe("countProjectFigures", () => {
  it("counts figures in sections before the target", () => {
    const project = {
      sections: {
        introduction: "文字内容 ![图1](chart.png)",
        methods: "无图文字",
      },
    };
    const count = countProjectFigures(project, "methods");
    expect(count).toBe(1);
  });

  it("counts FIGURE markers", () => {
    const project = {
      sections: {
        introduction: "【FIGURE:bar,x=1,2,3,y=4,5,6】",
      },
    };
    const count = countProjectFigures(project, "methods");
    expect(count).toBe(1);
  });

  it("returns 0 for empty project", () => {
    const count = countProjectFigures({}, "introduction");
    expect(count).toBe(0);
  });
});
