/** 统一内容处理管道 — 所有渲染器的唯一预处理入口 */

import { normalizeMathDelimiters } from "./math-delimiter";
import { parseMarkdownBlocks, MarkdownBlock } from "./markdown-parser";
import { processCitations } from "./citation";

export type { MarkdownBlock } from "./markdown-parser";

export interface ProcessedContent {
  /** 数学定界符已标准化（[...] → $$/$$） */
  mathNormalized: string;
  /** 结构块 */
  blocks: MarkdownBlock[];
  /** 引文已注入 HTML（用于预览） */
  withClickableCitations?: string;
}

export interface ProcessOptions {
  /** 是否注入可点击的引文 HTML（仅预览需要，PDF/Word 不需要） */
  withClickableCitations?: boolean;
}

/**
 * 统一内容处理管道。
 *
 * 原始 Markdown
 *   → normalizeMathDelimiters（公式定界符标准化）
 *   → parseMarkdownBlocks（块结构分类）
 *   → processCitations（注入引文 HTML，可选）
 */
export function processContent(rawContent: string, options?: ProcessOptions): ProcessedContent {
  const mathNormalized = normalizeMathDelimiters(rawContent);
  const blocks = parseMarkdownBlocks(mathNormalized);

  let withClickableCitations: string | undefined;
  if (options?.withClickableCitations) {
    withClickableCitations = processCitations(mathNormalized);
  }

  return { mathNormalized, blocks, withClickableCitations };
}
