/**
 * 参考文献按正文首次出现顺序重排，并重写 [n]。
 * 使用占位符避免「旧编号互换成新编号」时单次替换产生串扰。
 */

import { CITATION_GROUP_RE, FULLWIDTH_CITATION_RE, expandCitationGroup, normalizeAllCitationFormats } from "@/lib/citation";

const PH = (old: number) => `§§CITEOLD${old}§§`;

function expandCitationGroupUnchecked(raw: string): number[] {
  return expandCitationGroup(raw); // 无上限校验，等价于不传 refCount
}

/** 每次新建，避免模块级 /g lastIndex 串扰 */
function citationGroupRe(): RegExp {
  return new RegExp(CITATION_GROUP_RE.source, CITATION_GROUP_RE.flags);
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
  const re = citationGroupRe();
  while ((m = re.exec(normalized)) !== null) {
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
  const re = citationGroupRe();
  while ((m = re.exec(normalized)) !== null) {
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

export interface CompactCitationsResult {
  text: string;
  references: string[];
  /** 旧检索池序号 → 紧凑序号 */
  indexMap: Record<number, number>;
}

/**
 * 按正文首次出现顺序，仅保留被引用文献，并将 [n] 重排为连续 [1]…[K]。
 * 解决「正文仍写 [11] 但参考文献表只剩 4 条」的错位。
 */
export function compactCitationsToUsedReferences(
  text: string,
  referencesByIndex: string[],
): CompactCitationsResult | null {
  // 按原下标对齐（允许稀疏空洞）
  const pool = referencesByIndex.map((r) => r || "");
  const refCount = pool.length;
  if (refCount === 0 || !text.trim()) return null;

  const appearance = collectCitationFirstAppearance(text, refCount);
  if (appearance.length === 0) return null;

  const built = buildReorderedReferences(appearance, pool, { includeUncited: false });
  if (!built || built.references.length === 0) return null;

  const remapped = remapBracketCitations(normalizeAllCitationFormats(text), built.indexMap);
  return {
    text: remapped,
    references: built.references.filter(Boolean),
    indexMap: built.indexMap,
  };
}

/**
 * 将本节紧凑参考文献合并进项目全局表，并重写本节 [n] 为全局编号。
 */
export function mergeSectionReferencesIntoProject(params: {
  sectionText: string;
  sectionReferences: string[];
  projectReferences: string[];
}): { text: string; references: string[] } {
  const { sectionText, sectionReferences } = params;
  if (!sectionReferences.length) {
    return { text: sectionText, references: [...params.projectReferences] };
  }

  const projectRefs = [...params.projectReferences];
  const indexMap: Record<number, number> = {};

  const findProjectIndex = (source: string): number => {
    const exact = projectRefs.indexOf(source);
    if (exact >= 0) return exact;
    const cleaned = source.replace(/\.pdf$/i, "").trim();
    return projectRefs.findIndex(
      (r) => r === cleaned || r.replace(/\.pdf$/i, "").trim() === cleaned,
    );
  };

  for (let i = 0; i < sectionReferences.length; i++) {
    const src = sectionReferences[i];
    if (!src) continue;
    let projIdx = findProjectIndex(src);
    if (projIdx < 0) {
      projectRefs.push(src);
      projIdx = projectRefs.length - 1;
    }
    indexMap[i + 1] = projIdx + 1;
  }

  const text = remapBracketCitations(normalizeAllCitationFormats(sectionText), indexMap);
  return { text, references: projectRefs };
}

export function referencesFromRefMapping(refMapping: Record<string, number> | null | undefined): string[] {
  if (!refMapping || Object.keys(refMapping).length === 0) return [];
  const max = Math.max(...Object.values(refMapping));
  if (!Number.isFinite(max) || max < 1) return [];
  const pool: string[] = new Array(max).fill("");
  for (const [source, idx] of Object.entries(refMapping)) {
    if (idx >= 1 && idx <= max) pool[idx - 1] = source;
  }
  return pool;
}

/**
 * 扩写/预览区参考文献：优先用 SSE 下发的完整引用列表（与正文 [n] 顺序一致），
 * 否则用 refMapping 还原检索池，再从正文解析。
 */
export function buildPreviewReferencesFromContent(
  content: string,
  projectReferences: string[],
  streamReferences?: string[],
  refMapping?: Record<string, number> | null,
): string[] {
  if (streamReferences && streamReferences.length > 0) return streamReferences;
  if (!content.trim()) return [];
  const mappingPool = referencesFromRefMapping(refMapping);
  const pool = mappingPool.length > 0 ? mappingPool : projectReferences;
  return collectUsedReferences(content, pool);
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
 * 去掉章节正文末尾误生成的「参考文献 / References」整表。
 * 项目参考文献在侧栏统一维护；章节内只保留文中 [n]，不附列表。
 */
export function stripEmbeddedBibliography(text: string): string {
  if (!text) return text;
  let t = text;
  const patterns: RegExp[] = [
    /\n\s*---+\s*\n\s*\*{0,2}参考文献\*{0,2}\s*(?:\n|$)[\s\S]*$/i,
    /\n\s*\*{0,2}参考文献\*{0,2}\s*\n\s*(?:\[\d+\]|［\d+］)[\s\S]*$/i,
    /\n\s*#{1,3}\s*参考文献\s*\n[\s\S]*$/i,
    /\n\s*---+\s*\n\s*\*{0,2}References\*{0,2}\s*(?:\n|$)[\s\S]*$/i,
    /\n\s*\*{0,2}References\*{0,2}\s*\n\s*\[\d+\][\s\S]*$/i,
    /\n\s*#{1,3}\s*References\s*\n[\s\S]*$/i,
  ];
  for (const re of patterns) {
    t = t.replace(re, "");
  }
  // 残留占位引用标记
  t = t.replace(/\s*\[文献待补充\]/g, "");
  t = t.replace(/\s*\[引用\?\]/g, "");
  return t.replace(/\n{3,}/g, "\n\n").trimEnd();
}

/**
 * 从文本中移除超出 [1..refCount] 范围的引用号。
 * 合法引用保留；全组越界返回空字符串；混合组仅保留合法部分。
 * 支持中文标点（，、）和全角方括号（［］）。
 */
export function stripOutOfRangeCitations(text: string, refCount: number): string {
  if (!text || refCount <= 0) return text;
  const allowed = new Set<number>();
  for (let i = 1; i <= refCount; i++) allowed.add(i);
  return stripDisallowedCitations(text, allowed);
}

/**
 * 仅保留 allowed 集合中的引用号（用于：只允许有 RAG 全文的 grounded 编号）。
 * allowed 为空 → 去掉全部 [n]（摘要/无文献场景）。
 */
export function stripDisallowedCitations(
  text: string,
  allowedIndices: ReadonlySet<number>,
): string {
  if (!text) return text;

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
        if (allowedIndices.has(a) && allowedIndices.has(b)) validParts.push(part);
        continue;
      }
      const n = parseInt(part, 10);
      if (!isNaN(n) && allowedIndices.has(n)) validParts.push(part);
    }

    if (validParts.length === 0) return "";
    return `[${validParts.join(", ")}]`;
  });

  return t;
}

/**
 * 解析允许深度引用的编号集合。
 * - `undefined`：未启用 grounded 白名单 → 回退 1..refCount（兼容旧调用）
 * - `[]`：明确无全文片段 → 不允许任何 [n]
 * - 非空：仅允许列表中的编号（新检索来源编号以 grounded 为准，可不钳制到 refCount）
 */
export function resolveAllowedCitationIndices(
  refCount: number,
  groundedRefIndices?: number[],
): Set<number> {
  if (groundedRefIndices !== undefined) {
    if (groundedRefIndices.length === 0) return new Set();
    return new Set(groundedRefIndices.filter((n) => Number.isInteger(n) && n >= 1));
  }
  const allowed = new Set<number>();
  for (let i = 1; i <= refCount; i++) allowed.add(i);
  return allowed;
}
