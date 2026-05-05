/**
 * 参考文献按正文首次出现顺序重排，并重写 [n]。
 * 使用占位符避免「旧编号互换成新编号」时单次替换产生串扰。
 */

const PH = (old: number) => `§§CITEOLD${old}§§`;

const CITATION_GROUP_RE = /\[([0-9,\s\-–—]+)\]/g;

function expandCitationGroup(raw: string, refCount: number): number[] {
  const nums: number[] = [];
  const parts = raw.split(",");

  for (const part of parts) {
    const token = part.trim();
    if (!token) continue;

    const range = token.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (range) {
      const start = parseInt(range[1], 10);
      const end = parseInt(range[2], 10);
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      for (let n = min; n <= max; n++) {
        if (n > 0 && n <= refCount && !nums.includes(n)) nums.push(n);
      }
      continue;
    }

    const single = token.match(/^\d+$/);
    if (single) {
      const n = parseInt(token, 10);
      if (n > 0 && n <= refCount && !nums.includes(n)) nums.push(n);
    }
  }

  return nums;
}

function expandCitationGroupUnchecked(raw: string): number[] {
  const nums: number[] = [];
  const parts = raw.split(",");

  for (const part of parts) {
    const token = part.trim();
    if (!token) continue;

    const range = token.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (range) {
      const start = parseInt(range[1], 10);
      const end = parseInt(range[2], 10);
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      for (let n = min; n <= max; n++) {
        if (n > 0 && !nums.includes(n)) nums.push(n);
      }
      continue;
    }

    const single = token.match(/^\d+$/);
    if (single) {
      const n = parseInt(token, 10);
      if (n > 0 && !nums.includes(n)) nums.push(n);
    }
  }

  return nums;
}

/** 按全文阅读顺序收集首次出现的引用编号（1-based，且在合法范围内） */
export function collectCitationFirstAppearance(
  fullText: string,
  refCount: number,
): number[] {
  const order: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = CITATION_GROUP_RE.exec(fullText)) !== null) {
    for (const num of expandCitationGroup(m[1], refCount)) {
      if (!order.includes(num)) order.push(num);
    }
  }
  return order;
}

export function collectInvalidCitationNumbers(fullText: string, refCount: number): number[] {
  const invalid: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = CITATION_GROUP_RE.exec(fullText)) !== null) {
    for (const num of expandCitationGroupUnchecked(m[1])) {
      if ((num < 1 || num > refCount) && !invalid.includes(num)) invalid.push(num);
    }
  }
  return invalid;
}

export interface ReorderRefsResult {
  references: string[];
  /** 旧文献序号(1-based) -> 新序号(1-based) */
  indexMap: Record<number, number>;
  appearanceCount: number;
}

/**
 * 根据首次出现顺序构建新文献列表与 old->new 映射。
 */
export function buildReorderedReferences(
  appearanceOrder: number[],
  oldReferences: string[],
  options: { includeUncited?: boolean } = {},
): ReorderRefsResult | null {
  const refCount = oldReferences.length;
  if (refCount === 0) return null;
  if (appearanceOrder.length === 0) return null;

  const oldRefs = [...oldReferences];
  const newRefs: string[] = [];
  const indexMap: Record<number, number> = {};
  const seen = new Set<number>();

  for (let i = 0; i < appearanceOrder.length; i++) {
    const oldIdx = appearanceOrder[i];
    if (oldIdx < 1 || oldIdx > oldRefs.length) continue;
    if (seen.has(oldIdx)) continue;
    seen.add(oldIdx);
    newRefs.push(oldRefs[oldIdx - 1]);
    indexMap[oldIdx] = i + 1;
  }

  if (options.includeUncited ?? true) {
    oldRefs.forEach((_ref, i) => {
      const oldIdx = i + 1;
      if (!appearanceOrder.includes(oldIdx)) {
        newRefs.push(oldRefs[oldIdx - 1]);
        indexMap[oldIdx] = newRefs.length;
      }
    });
  }

  return {
    references: newRefs,
    indexMap,
    appearanceCount: appearanceOrder.length,
  };
}

/** 将正文中的 [旧] 按 indexMap 改为 [新]，不破坏互换映射 */
export function remapBracketCitations(text: string, indexMap: Record<number, number>): string {
  if (!text) return text;
  const maxKnownIndex = Math.max(1000, ...Object.keys(indexMap).map((key) => parseInt(key, 10)));
  let t = text.replace(CITATION_GROUP_RE, (match, raw: string) => {
    const nums = expandCitationGroup(raw, maxKnownIndex);
    if (nums.length === 0) return match;
    return nums.map((oldIdx) => (indexMap[oldIdx] != null ? PH(oldIdx) : `[${oldIdx}]`)).join(", ");
  });

  for (const [oldStr, newIdx] of Object.entries(indexMap)) {
    const old = parseInt(oldStr, 10);
    t = t.split(PH(old)).join(`[${newIdx}]`);
  }

  return t.replace(/(?:\[(\d+)\](?:,\s*)?)+/g, (group) => {
    const nums = Array.from(group.matchAll(/\[(\d+)\]/g)).map((m) => parseInt(m[1], 10));
    return nums.length > 0 ? `[${nums.join(", ")}]` : group;
  });
}

export function collectUsedReferences(text: string, references: string[]): string[] {
  const order = collectCitationFirstAppearance(text, references.length);
  return order.map((idx) => references[idx - 1]).filter((ref): ref is string => Boolean(ref));
}
