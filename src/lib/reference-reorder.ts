/**
 * 参考文献按正文首次出现顺序重排，并重写 [n]。
 * 使用占位符避免「旧编号互换成新编号」时单次替换产生串扰。
 */

import { CITATION_GROUP_RE, FULLWIDTH_CITATION_RE, expandCitationGroup } from "@/lib/citation";
import { normalizeAllCitationFormats } from "@/lib/citation-bounds";

const PH = (old: number) => `§§CITEOLD${old}§§`;

function expandCitationGroupUnchecked(raw: string): number[] {
  return expandCitationGroup(raw); // 无上限校验，等价于不传 refCount
}

/** 按全文阅读顺序收集首次出现的引用编号（1-based，且在合法范围内） */
export function collectCitationFirstAppearance(
  fullText: string,
  refCount: number,
): number[] {
  const normalized = normalizeCitationFormat(
    fullText.replace(FULLWIDTH_CITATION_RE, (_m, inner) => `[${inner}]`)
  );
  const order: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = CITATION_GROUP_RE.exec(normalized)) !== null) {
    for (const num of expandCitationGroup(m[1], refCount)) {
      if (!order.includes(num)) order.push(num);
    }
  }
  return order;
}

export function collectInvalidCitationNumbers(fullText: string, refCount: number): number[] {
  const normalized = normalizeCitationFormat(
    fullText.replace(FULLWIDTH_CITATION_RE, (_m, inner) => `[${inner}]`)
  );
  const invalid: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = CITATION_GROUP_RE.exec(normalized)) !== null) {
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
  // 全角方括号标准化
  let t = text.replace(FULLWIDTH_CITATION_RE, (_m, inner) => `[${inner}]`);
  const maxKnownIndex = Math.max(1000, ...Object.keys(indexMap).map((key) => parseInt(key, 10)));
  t = t.replace(CITATION_GROUP_RE, (match, raw: string) => {
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

/**
 * 扫描项目所有章节文本，收集实际被引用的参考文献编号集合。
 * 返回所有在正文中出现过的引用编号（1-based）。
 */
/** 已迁移至 citation-bounds.ts 的 normalizeAllCitationFormats，此处保留别名 */
const normalizeCitationFormat = normalizeAllCitationFormats;

export function collectAllCitedIndices(project: {
  abstract?: string | null;
  sections: Record<string, string | undefined>;
  references: string[];
}): Set<number> {
  const refCount = project.references.length;
  if (refCount === 0) return new Set();

  const rawText = [
    project.abstract || "",
    ...Object.values(project.sections || {}).filter((v): v is string => typeof v === "string"),
  ].join("\n\n");

  const allText = normalizeCitationFormat(rawText);

  const cited = new Set<number>();
  for (const idx of collectCitationFirstAppearance(allText, refCount)) {
    cited.add(idx);
  }
  return cited;
}

/**
 * 移除未被正文引用的参考文献，返回干净列表和 old→new 索引映射。
 * indexMap[oldIdx] = newIdx 表示保留且位置变更；indexMap[oldIdx] = null 表示被移除。
 */
export function pruneUncitedReferences(project: {
  abstract?: string | null;
  sections: Record<string, string | undefined>;
  references: string[];
}): { references: string[]; removed: number; indexMap: Record<number, number | null> } {
  const citedIndices = collectAllCitedIndices(project);
  const kept: string[] = [];
  const indexMap: Record<number, number | null> = {};
  let removed = 0;

  for (let i = 0; i < project.references.length; i++) {
    const oldIdx = i + 1;
    if (citedIndices.has(oldIdx)) {
      kept.push(project.references[i]);
      indexMap[oldIdx] = kept.length; // 新位置 = kept.length（1-based）
    } else {
      indexMap[oldIdx] = null;
      removed++;
    }
  }

  return { references: kept, removed, indexMap };
}

/**
 * 剪枝后重映射正文中的引用编号。
 * 根据 pruneUncitedReferences 返回的 indexMap：
 * - indexMap[old] = new → 替换为 [new]
 * - indexMap[old] = null → 从引用组中移除
 * - 全组被移除 → 返回空字符串
 */
export function remapPrunedCitations(text: string, indexMap: Record<number, number | null>): string {
  if (!text) return text;

  const PH = (old: number) => `§§PRUNE${old}§§`;

  let t = text.replace(CITATION_GROUP_RE, (_match, raw: string) => {
    const nums = expandCitationGroup(raw);
    if (nums.length === 0) return _match;

    const remapped: string[] = [];
    for (const oldIdx of nums) {
      const mapped = indexMap[oldIdx];
      if (mapped == null) continue; // 被移除，跳过
      remapped.push(PH(oldIdx));
    }

    if (remapped.length === 0) return "";
    return remapped.join(", ");
  });

  // 替换占位符为新的引用号
  for (const [oldStr, newIdx] of Object.entries(indexMap)) {
    if (newIdx == null) continue;
    const old = parseInt(oldStr, 10);
    t = t.split(PH(old)).join(`[${newIdx}]`);
  }

  // 规范化相邻引用组
  return t.replace(/(?:\[(\d+)\](?:,\s*)?)+/g, (group) => {
    const nums = Array.from(group.matchAll(/\[(\d+)\]/g)).map((m) => parseInt(m[1], 10));
    return nums.length > 0 ? `[${nums.join(", ")}]` : group;
  });
}

/**
 * 从文本中移除超出 [1..refCount] 范围的引用号。
 * 合法引用保留；全组越界返回空字符串；混合组仅保留合法部分。
 * 支持中文标点（，、）和全角方括号（［］）。
 */
export function stripOutOfRangeCitations(text: string, refCount: number): string {
  if (!text || refCount <= 0) return text;

  // 归一化非标准引用格式 + 全角方括号标准化
  let t = normalizeCitationFormat(text);
  t = t.replace(/［([0-9,\s\-–—，、]+)］/g, (_m: string, inner: string) => `[${inner}]`);

  t = t.replace(/\[([0-9,\s\-–—，、]+)\]/g, (_match: string, nums: string) => {
    const parts = nums.split(/[,，、]\s*/).map((p: string) => p.trim()).filter(Boolean);
    const validParts: string[] = [];

    for (const part of parts) {
      const range = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
      if (range) {
        const a = parseInt(range[1], 10);
        const b = parseInt(range[2], 10);
        if (a >= 1 && a <= refCount && b >= 1 && b <= refCount) validParts.push(part);
        continue;
      }
      const n = parseInt(part, 10);
      if (!isNaN(n) && n >= 1 && n <= refCount) validParts.push(part);
    }

    if (validParts.length === 0) return "";
    return `[${validParts.join(", ")}]`;
  });

  return t;
}
