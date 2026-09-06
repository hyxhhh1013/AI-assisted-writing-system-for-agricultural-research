/**
 * 论文 IMRaD 章节标题识别（索引 Stage 1 与写作检索共用规则）
 *
 * 只认「短行标题」，避免正文里的 "as discussed in the Introduction" 误切。
 */

export const CHUNK_SCHEMA_VERSION = 2;

export const PAPER_SECTION_KEYS = [
  "abstract",
  "introduction",
  "methods",
  "results",
  "discussion",
  "conclusion",
];

const HEADING_RULES = [
  { key: "abstract", re: /^(abstract|summary|摘要|摘\s*要)$/i },
  { key: "introduction", re: /^(introduction|引言|前言|绪论)$/i },
  { key: "methods", re: /^(materials?\s+and\s+methods|methodology|experimental(?:\s+(?:section|methods?))?|methods?|材料与方法|试验方法|研究方法|实验方法)$/i },
  { key: "results", re: /^(results?(?:\s+and\s+discussion)?|结果(?:与分析|与讨论)?|研究结果)$/i },
  { key: "discussion", re: /^(discussion|讨论)$/i },
  { key: "conclusion", re: /^(conclusions?|concluding\s+remarks|结论|结语|小结)$/i },
];

const NUMBER_PREFIX = /^(?:(?:\d{1,2}|[IVXivx]{1,4}|[一二三四五六七八九十]+)[\.、．\)]\s*)/;

function stripNumberPrefix(line) {
  return line.replace(NUMBER_PREFIX, "").replace(/\s+/g, " ").trim();
}

/** @returns {string|null} paper section key */
export function detectSectionHeading(line) {
  const raw = String(line || "").replace(/\s+/g, " ").trim();
  if (raw.length < 2 || raw.length > 72) return null;
  if (/[。；;]$/.test(raw)) return null;
  const stripped = stripNumberPrefix(raw);
  if (!stripped || stripped.length > 64) return null;
  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length > 8) return null;
  for (const { key, re } of HEADING_RULES) {
    if (re.test(stripped)) return key;
  }
  return null;
}

/**
 * 按标题切行序列，章节状态可跨页延续。
 * @returns {{ section: string|null, text: string }[]}
 */
export function segmentLinesBySection(lines, startSection = null) {
  let current = startSection || null;
  const segs = [];
  let buf = [];

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
