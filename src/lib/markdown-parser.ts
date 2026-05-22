/** Markdown 块结构解析器 — 全项目单一解析源 */

export type BlockType = "heading" | "paragraph" | "bullet-list" | "ordered-list" | "table" | "image" | "blank";

export interface MarkdownBlock {
  type: BlockType;
  lines: string[];
  /** 标题级别（1-6），仅 heading */
  level?: number;
  /** 标题文本（去除 ## 前缀），仅 heading */
  title?: string;
  /** 图片说明，仅 image */
  caption?: string;
  /** 图片 URL，仅 image */
  url?: string;
}

/**
 * 将 Markdown 文本解析为结构块数组。
 * 被 PDF 渲染器、DOCX 渲染器、预览渲染器共享。
 */
export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const rawLines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let ordered = false;
  let tableRows: string[][] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", lines: [...paragraph] });
      paragraph = [];
    }
  };

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: ordered ? "ordered-list" : "bullet-list", lines: [...listItems] });
      listItems = [];
    }
  };

  const flushTable = () => {
    if (tableRows.length > 0) {
      blocks.push({ type: "table", lines: tableRows.map(r => r.join("|")) });
      tableRows = [];
    }
  };

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }

    // 表格行（以 | 开头和结尾，且不以 # 开头）
    if (/^\|.+\|$/.test(line) && !/^#/.test(line)) {
      flushParagraph();
      flushList();
      tableRows.push(line.replace(/^\||\|$/g, "").split("|"));
      continue;
    }

    // 标题
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      flushTable();
      blocks.push({
        type: "heading",
        lines: [line],
        level: heading[1].length,
        title: heading[2].trim(),
      });
      continue;
    }

    // 图片
    const imgMatch = line.match(/^!\[([^\]]*)\]\((.+)\)$/);
    if (imgMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "image",
        lines: [line],
        caption: imgMatch[1] || "",
        url: imgMatch[2] || "",
      });
      continue;
    }

    // 无序列表
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      if (listItems.length > 0 && ordered) flushList();
      ordered = false;
      listItems.push(bullet[1]);
      continue;
    }

    // 有序列表
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      if (listItems.length > 0 && !ordered) flushList();
      ordered = true;
      listItems.push(numbered[1]);
      continue;
    }

    // 普通段落文本
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  flushTable();
  return blocks;
}
