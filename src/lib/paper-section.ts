/**
 * 文献 PDF 章节（IMRaD）↔ 写作章节对齐。
 * 标题识别规则须与 scripts/lib/paper-section.mjs 保持一致（index-pdfs 用 mjs）。
 */

import type { RagChunk } from "@/lib/rag";

export const CHUNK_SCHEMA_VERSION = 2;

export const PAPER_SECTION_KEYS = [
  "abstract",
  "introduction",
  "methods",
  "results",
  "discussion",
  "conclusion",
] as const;

export type PaperSectionKey = (typeof PAPER_SECTION_KEYS)[number];

const HEADING_RULES: Array<{ key: PaperSectionKey; re: RegExp }> = [
  { key: "abstract", re: /^(abstract|summary|摘要|摘\s*要)$/i },
  { key: "introduction", re: /^(introduction|引言|前言|绪论)$/i },
  { key: "methods", re: /^(materials?\s+and\s+methods|methodology|experimental(?:\s+(?:section|methods?))?|methods?|材料与方法|试验方法|研究方法|实验方法)$/i },
  { key: "results", re: /^(results?(?:\s+and\s+discussion)?|结果(?:与分析|与讨论)?|研究结果)$/i },
  { key: "discussion", re: /^(discussion|讨论)$/i },
  { key: "conclusion", re: /^(conclusions?|concluding\s+remarks|结论|结语|小结)$/i },
];

const NUMBER_PREFIX = /^(?:(?:\d{1,2}|[IVXivx]{1,4}|[一二三四五六七八九十]+)[\.、．\)]\s*)/;

export function isPaperSectionKey(value: string): value is PaperSectionKey {
  return (PAPER_SECTION_KEYS as readonly string[]).includes(value);
}

export function detectSectionHeading(line: string): PaperSectionKey | null {
  const raw = String(line || "").replace(/\s+/g, " ").trim();
  if (raw.length < 2 || raw.length > 72) return null;
  if (/[。；;]$/.test(raw)) return null;
  const stripped = raw.replace(NUMBER_PREFIX, "").replace(/\s+/g, " ").trim();
  if (!stripped || stripped.length > 64) return null;
  if (stripped.split(/\s+/).filter(Boolean).length > 8) return null;
  for (const { key, re } of HEADING_RULES) {
    if (re.test(stripped)) return key;
  }
  return null;
}

export function segmentLinesBySection(
  lines: string[],
  startSection: PaperSectionKey | null = null,
): Array<{ section: PaperSectionKey | null; text: string }> {
  let current: PaperSectionKey | null = startSection;
  const segs: Array<{ section: PaperSectionKey | null; text: string }> = [];
  let buf: string[] = [];

  const flush = () => {
    const text = buf.join(" ").replace(/\s+/g, " ").trim();
    if (text) segs.push({ section: current, text });
    buf = [];
  };

  for (const line of lines || []) {
    const hit = detectSectionHeading(line);
    if (hit) {
      flush();
      current = hit;
      buf.push(String(line).trim());
      continue;
    }
    buf.push(String(line).trim());
  }
  flush();
  return segs;
}

/** 写某一节时优先取证的文献章节（顺序=优先级） */
export function preferredPaperSectionsForWriting(writingSection: string): PaperSectionKey[] {
  switch (writingSection) {
    case "abstract":
      return ["abstract", "conclusion", "introduction"];
    case "introduction":
      return ["introduction", "abstract"];
    case "methods":
      return ["methods"];
    case "results":
      return ["results", "discussion"];
    case "discussion":
      return ["discussion", "results"];
    case "conclusion":
      return ["conclusion", "discussion"];
    case "background":
    case "literature_body":
      return ["introduction", "discussion", "results", "conclusion"];
    default:
      return [];
  }
}

/**
 * 把带 metadata.section 的命中提前。
 * 旧索引没有 section：当作未标注保留，避免迁移未完成时检索变空。
 */
export function preferChunksByPaperSection(
  chunks: RagChunk[],
  writingSection: string,
  opts?: { minPreferred?: number },
): RagChunk[] {
  if (chunks.length <= 1) return chunks;
  const preferred = preferredPaperSectionsForWriting(writingSection);
  if (preferred.length === 0) return chunks;

  const rank = new Map(preferred.map((k, i) => [k, i]));
  const tagged: RagChunk[] = [];
  const untagged: RagChunk[] = [];
  const other: RagChunk[] = [];
  for (const c of chunks) {
    const sec = c.metadata.section;
    if (!sec || !isPaperSectionKey(sec)) {
      untagged.push(c);
      continue;
    }
    if (rank.has(sec)) tagged.push(c);
    else other.push(c);
  }

  tagged.sort((a, b) => {
    const ra = rank.get(a.metadata.section as PaperSectionKey) ?? 99;
    const rb = rank.get(b.metadata.section as PaperSectionKey) ?? 99;
    return ra - rb;
  });

  const minPreferred = opts?.minPreferred ?? 2;
  if (tagged.length < minPreferred) {
    return chunks;
  }
  return [...tagged, ...untagged, ...other];
}
