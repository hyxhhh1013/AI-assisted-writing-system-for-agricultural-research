/**
 * 引文处理 — 全项目单一数据源
 *
 * 合并自 citation.ts + citation-bounds.ts + citation-validator.ts（共 ~340 行）
 *
 * 功能分区：
 *   1) 正则常量 + 基础展开
 *   2) HTML 渲染
 *   3) 归一化 + 越界检测
 *   4) 引用真实性校验 + 数据证据核实
 */

// ============================================================================
// 1) 正则常量 + 基础展开
// ============================================================================

/**
 * 引文组正则：[1], [1,2], [3-5], [1,3-5]
 * 支持中文逗号（，）、顿号（、）和全角方括号（［］）
 */
export const CITATION_GROUP_RE = /\[([0-9,\s\-–—，、]+)\]/g;
/** 全角方括号变体：［1］, ［1,2］ */
export const FULLWIDTH_CITATION_RE = /［([0-9,\s\-–—，、]+)］/g;
/** 误用中文角括号作引用：【16】、【16, 21】（不含 FIGURE/占位等长文本） */
export const CORNER_BRACKET_CITATION_RE = /【([0-9,\s\-–—，、]+)】/g;

/** 将全角/角括号引用统一为半角 [n] */
export function normalizeCitationBrackets(text: string): string {
  if (!text) return text;
  let t = text.replace(FULLWIDTH_CITATION_RE, (_m, inner) => `[${inner}]`);
  t = t.replace(CORNER_BRACKET_CITATION_RE, (_m, inner) => `[${inner}]`);
  return t;
}

/** 展开引文组为数字数组，可选 refCount 上限校验 */
export function expandCitationGroup(raw: string, refCount?: number): number[] {
  const nums: number[] = [];
  const parts = raw.split(/[,，、]/);

  for (const part of parts) {
    const token = part.trim();
    if (!token) continue;

    const range = token.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (range) {
      const start = parseInt(range[1], 10);
      const end = parseInt(range[2], 10);
      for (let n = Math.min(start, end); n <= Math.max(start, end); n++) {
        if (n < 1) continue;
        if (refCount != null && n > refCount) continue;
        if (!nums.includes(n)) nums.push(n);
      }
      continue;
    }

    const single = token.match(/^\d+$/);
    if (single) {
      const n = parseInt(token, 10);
      if (n < 1) continue;
      if (refCount != null && n > refCount) continue;
      if (!nums.includes(n)) nums.push(n);
    }
  }

  return nums;
}

/**
 * 无上限校验的展开（向后兼容 shared.tsx 的 expandCiteGroup）。
 * @deprecated 请优先使用 expandCitationGroup(raw, refCount) 以启用上限校验。
 */
export function expandCiteGroup(raw: string): number[] {
  return expandCitationGroup(raw);
}

// ============================================================================
// 2) HTML 渲染
// ============================================================================

/** 将正文中的 [n] 替换为可点击的 HTML 标签 */
export function processCitations(text: string): string {
  const normalized = normalizeCitationBrackets(text);
  return normalized.replace(
    CITATION_GROUP_RE,
    (match, raw: string) =>
      `<sup class="ref-cite" data-cite="${raw.replace(/\s/g, "")}" style="cursor:pointer;color:#2563eb;font-weight:600;transition:color 0.15s">${match}</sup>`,
  );
}

/** 创建引用点击事件处理器 */
export function handleCiteClick(onCiteClick: (nums: number[]) => void) {
  return (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const cite = target.closest(".ref-cite") as HTMLElement | null;
    if (!cite) return;
    const raw = cite.getAttribute("data-cite");
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    onCiteClick(expandCiteGroup(raw));
  };
}

// ============================================================================
// 3) 归一化 + 越界检测（原 citation-bounds.ts）
// ============================================================================

/**
 * 将所有非标准引用格式统一归一化为 [n] 格式。
 * 合并了 reference-reorder.ts 的 normalizeCitationFormat 并补充更多变体。
 */
export function normalizeAllCitationFormats(text: string): string {
  if (!text) return text;
  let t = normalizeCitationBrackets(text);

  // Markdown / 模型转义：\[11\]、\[11]、[11\] → [11]
  const citeInner = "([0-9,\\s\\-–—，、]+)";
  t = t.replace(new RegExp(`\\\\+\\[${citeInner}\\\\+\\]`, "g"), "[$1]");
  t = t.replace(new RegExp(`\\\\+\\[${citeInner}\\]`, "g"), "[$1]");
  t = t.replace(new RegExp(`\\[${citeInner}\\\\+\\]`, "g"), "[$1]");

  // [参考来源23] / [参考来源 [23]] → [23]
  t = t.replace(/\[参考来源\s*(?:\[)?(\d+)(?:\])?\]/g, "[$1]");

  // [文献23] / [文献 23] → [23]
  t = t.replace(/\[文献\s*(\d+)\]/g, "[$1]");

  // [Ref 23] / [ref 23] → [23]
  t = t.replace(/\[[Rr]ef\s*(\d+)\]/g, "[$1]");

  // [参23] / [参 23] → [23]（简写变体）
  t = t.replace(/\[参\s*(\d+)\]/g, "[$1]");

  // [来源23] → [23]
  t = t.replace(/\[来源\s*(\d+)\]/g, "[$1]");

  // 组内去重 + 排序 + 连续区间压缩：[20,17,17] → [17,20]；[1,2,3] → [1-3]
  t = t.replace(CITATION_GROUP_RE, (_m, raw: string) => dedupeCitationGroup(raw));

  return t;
}

/** 引用组内去重并压缩连续区间 */
function dedupeCitationGroup(raw: string): string {
  const trimmed = raw.replace(/[，、]/g, ",").trim();
  if (!trimmed) return `[${raw}]`;
  const nums = expandCiteGroup(trimmed);
  if (nums.length === 0) return `[${raw}]`;
  const uniq = [...new Set(nums)].sort((a, b) => a - b);
  const parts: string[] = [];
  let runStart = uniq[0];
  let prev = uniq[0];
  for (let i = 1; i <= uniq.length; i++) {
    const cur = uniq[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    parts.push(prev === runStart ? `${runStart}` : `${runStart}-${prev}`);
    if (i < uniq.length) {
      runStart = cur;
      prev = cur;
    }
  }
  return `[${parts.join(",")}]`;
}

export interface BoundsCheckResult {
  /** 清理后的文本（越界引用已替换为 [引用?]） */
  cleaned: string;
  /** 越界的引用编号列表（去重、排序） */
  outOfBounds: number[];
}

/**
 * 检测并清理文本中超出 refCount 范围的引用。
 * 越界引用替换为 [引用?] 占位符，后续由 cleanMarkdownArtifacts 统一清除。
 */
export function markOutOfBoundsCitations(text: string, refCount: number): BoundsCheckResult {
  if (!text || refCount <= 0) return { cleaned: text, outOfBounds: [] };

  const normalized = normalizeAllCitationFormats(text);
  const outOfBoundsSet = new Set<number>();

  // 第一遍：收集所有越界编号
  let m: RegExpExecArray | null;
  const re = new RegExp(CITATION_GROUP_RE.source, CITATION_GROUP_RE.flags);
  while ((m = re.exec(normalized)) !== null) {
    for (const num of expandCitationGroup(m[1])) {
      if (num > refCount) outOfBoundsSet.add(num);
    }
  }

  if (outOfBoundsSet.size === 0) return { cleaned: text, outOfBounds: [] };

  const outOfBounds = Array.from(outOfBoundsSet).sort((a, b) => a - b);

  // 第二遍：替换越界引用为占位符
  const cleaned = normalized.replace(CITATION_GROUP_RE, (_match, raw: string) => {
    const parts = raw.split(/[,，、]/);
    const validParts: string[] = [];

    for (const part of parts) {
      const token = part.trim();
      if (!token) continue;

      const range = token.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
      if (range) {
        const a = parseInt(range[1], 10);
        const b = parseInt(range[2], 10);
        const start = Math.min(a, b);
        const end = Math.max(a, b);
        const validInRange: number[] = [];
        for (let n = start; n <= end; n++) {
          if (n >= 1 && n <= refCount) validInRange.push(n);
        }
        if (validInRange.length > 0) {
          if (validInRange.length === 1) {
            validParts.push(String(validInRange[0]));
          } else {
            validParts.push(`${validInRange[0]}-${validInRange[validInRange.length - 1]}`);
          }
        }
        continue;
      }

      const n = parseInt(token, 10);
      if (!isNaN(n) && n >= 1 && n <= refCount) {
        validParts.push(token);
      }
    }

    if (validParts.length === 0) return "[引用?]";
    return `[${validParts.join(", ")}]`;
  });

  return { cleaned, outOfBounds };
}

// ============================================================================
// 4) 引用真实性校验 + 数据证据核实（原 citation-validator.ts）
// ============================================================================

interface CitationCheckResult {
  number: number;
  sourceName: string;
  citedSentence: string;
  overlap: number;
  passed: boolean;
}

function extractCitationContext(text: string, position: number, windowSize = 80): string {
  const start = Math.max(0, position - windowSize);
  const end = Math.min(text.length, position + windowSize);
  return text.slice(start, end);
}

function extractKeyTerms(text: string): Set<string> {
  const terms = new Set<string>();
  const englishWords = text.toLowerCase().match(/[a-z]{3,}/g);
  if (englishWords) englishWords.forEach((w) => terms.add(w));
  const chineseChars = text.replace(/[^一-龥]/g, "");
  for (let i = 0; i < chineseChars.length - 1; i++) {
    terms.add(chineseChars.substring(i, i + 2));
  }
  const contentChars = chineseChars.replace(/[的得地了着过在于是在与和或及而是被把对以从到向由按通过]/g, "");
  for (const ch of contentChars) terms.add(ch);
  return terms;
}

const OVERLAP_THRESHOLD = 0.08;

export function validateCitations(draftText: string, contextText: string): CitationCheckResult[] {
  if (!draftText || !contextText) return [];

  const results: CitationCheckResult[] = [];
  const seen = new Set<number>();
  const citationRegex = /\[(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = citationRegex.exec(draftText)) !== null) {
    const num = parseInt(match[1], 10);
    if (seen.has(num)) continue;
    seen.add(num);

    const citedSentence = extractCitationContext(draftText, match.index);
    const draftTerms = extractKeyTerms(citedSentence);

    if (draftTerms.size === 0) {
      results.push({ number: num, sourceName: `[${num}]`, citedSentence, overlap: 1, passed: true });
      continue;
    }

    const paragraphs = contextText.split(/\n\n+/);
    let bestOverlap = 0;
    let bestSource = `[${num}]`;

    for (const para of paragraphs) {
      if (para.length < 20) continue;
      const sourceTerms = extractKeyTerms(para);
      let overlapCount = 0;
      for (const term of draftTerms) {
        if (sourceTerms.has(term)) overlapCount++;
      }
      const overlap = overlapCount / draftTerms.size;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        const nameMatch = para.match(/^(.+?)(?:\n|$)/);
        if (nameMatch) bestSource = nameMatch[1].trim();
      }
    }

    results.push({
      number: num,
      sourceName: bestSource,
      citedSentence,
      overlap: bestOverlap,
      passed: bestOverlap >= OVERLAP_THRESHOLD,
    });
  }

  return results;
}

export interface DataClaimCheckResult {
  claimId: string;
  claimText: string;
  found: boolean;
  citedCorrectly: boolean;
  issue?: string;
}

export function validateDataClaims(
  text: string,
  evidenceClaims: { id: string; text: string; values: Record<string, number | string>; tolerance: number }[],
): DataClaimCheckResult[] {
  const results: DataClaimCheckResult[] = [];

  for (const claim of evidenceClaims) {
    const escapedId = claim.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const idPattern = new RegExp("\\[" + escapedId + "\\]", "i");
    const found = idPattern.test(text);

    let citedCorrectly = found;
    let issue: string | undefined;

    if (found) {
      for (const [key, expected] of Object.entries(claim.values)) {
        if (typeof expected !== "number") continue;
        const idx = text.search(idPattern);
        if (idx >= 0) {
          const nearby = text.slice(Math.max(0, idx - 150), idx + 50);
          const expectedStr = String(Math.round(expected * 100) / 100);
          const numPattern = new RegExp(expectedStr.replace(/\./g, "\\."));
          if (!numPattern.test(nearby)) {
            citedCorrectly = false;
            issue = `${key} expected ${expectedStr}, not found near citation`;
            break;
          }
        }
      }
    } else {
      issue = `Data claim [${claim.id}] not cited in text`;
    }

    results.push({ claimId: claim.id, claimText: claim.text, found, citedCorrectly, issue });
  }

  return results;
}
