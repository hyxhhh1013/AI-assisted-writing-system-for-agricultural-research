/** 检查点预览上限：够通读整份大纲，避免把超长稿塞进 SSE */
export const OUTLINE_CHECKPOINT_PREVIEW_MAX = 24_000;

export const OUTLINE_REVISE_CHIPS = [
  {
    id: "add-methods",
    label: "补方法/数据节",
    note: "请补一节方法或数据来源，说明材料、实验设计或文献筛选怎么做。",
  },
  {
    id: "reorder",
    label: "调整章节顺序",
    note: "请按更顺的叙事重排一级标题，并说明新顺序理由。",
  },
  {
    id: "tighten",
    label: "一级标题再收一收",
    note: "一级标题偏碎或偏多，请合并相近节，骨架再清楚一点。",
  },
  {
    id: "focus",
    label: "摘要缩短、讨论加厚",
    note: "摘要收短，把篇幅留给讨论、局限与展望。",
  },
] as const;

export type OutlineReviewBlock =
  | { type: "heading"; id: string; level: number; title: string }
  | { type: "body"; text: string };

export function capOutlinePreview(
  text: string,
  max = OUTLINE_CHECKPOINT_PREVIEW_MAX,
): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}\n\n…（后文请到「论证提纲」页查看全文）`;
}

/** 工具结果里优先用全文 outline，观察卡仍可用短 preview */
export function outlineTextFromToolData(data: unknown, fallback = ""): string {
  if (data && typeof data === "object") {
    const rec = data as { outline?: unknown; preview?: unknown };
    if (typeof rec.outline === "string" && rec.outline.trim()) return rec.outline;
    if (typeof rec.preview === "string" && rec.preview.trim()) return rec.preview;
  }
  return fallback;
}

export function pickOutlineBody(
  preview?: string,
  projectOutline?: string | null,
): string {
  const fromCheckpoint = preview?.trim() ?? "";
  const fromProject = projectOutline?.trim() ?? "";
  if (fromProject.length > fromCheckpoint.length) return fromProject;
  return fromCheckpoint || fromProject;
}

export function countOutlineChars(markdown: string): number {
  return markdown.replace(/\s+/g, "").length;
}

export function splitOutlineBlocks(markdown: string): OutlineReviewBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: OutlineReviewBlock[] = [];
  let body: string[] = [];
  let headingCount = 0;

  const flushBody = () => {
    const text = body.join("\n").trim();
    body = [];
    if (text) blocks.push({ type: "body", text });
  };

  for (const line of lines) {
    const m = line.trim().match(/^(#{1,3})\s+(.+)$/);
    if (!m) {
      body.push(line);
      continue;
    }
    flushBody();
    const title = m[2].replace(/\*\*/g, "").trim();
    if (!title) continue;
    headingCount += 1;
    blocks.push({
      type: "heading",
      id: `outline-h-${headingCount}`,
      level: m[1].length,
      title,
    });
  }
  flushBody();
  return blocks;
}

export function outlineLevelLabel(level: number): string {
  if (level <= 1) return "一级";
  if (level === 2) return "二级";
  return "三级";
}

export function outlineHeadingChips(
  blocks: readonly OutlineReviewBlock[],
): Array<{ id: string; title: string; level: number }> {
  return blocks
    .filter((b): b is Extract<OutlineReviewBlock, { type: "heading" }> => b.type === "heading")
    .filter((b) => b.level <= 3);
}

/** 章节名本身不能当成「这篇文献对上了本节」 */
const GENERIC_HEADING = new Set([
  "引言", "方法", "结果", "讨论", "结论", "摘要", "综述", "概述", "研究", "分析",
  "现状", "背景", "文献", "进展", "章节", "展望", "总题",
  "introduction", "methods", "results", "discussion", "conclusion", "abstract", "review",
]);

export interface OutlineBlueprintCite {
  label: string;
  cites: number[];
}

function headingTokens(title: string): string[] {
  const parts = title.split(/[\s,，。；;、/／（）()【】[\]：:]+/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    if (/[a-z]/i.test(part)) {
      const word = part.toLowerCase();
      if (word.length >= 3 && !GENERIC_HEADING.has(word)) out.push(word);
      continue;
    }
    const chunks = part.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
    for (const word of chunks) {
      if (!GENERIC_HEADING.has(word)) out.push(word);
      if (word.length >= 4) {
        for (let i = 0; i < word.length - 1; i++) {
          const gram = word.slice(i, i + 2);
          if (!GENERIC_HEADING.has(gram)) out.push(gram);
        }
      }
    }
  }
  return [...new Set(out)];
}

/** 蓝图主张里已经写明的 [n]，且节名能对上当前标题。没有写 [n] 的主张不编编号。 */
export function blueprintCitesFromJson(raw: string | null | undefined): OutlineBlueprintCite[] {
  if (!raw?.trim()) return [];
  let data: { sectionGuides?: unknown };
  try {
    data = JSON.parse(raw) as { sectionGuides?: unknown };
  } catch {
    return [];
  }
  if (!Array.isArray(data.sectionGuides)) return [];
  const cites: OutlineBlueprintCite[] = [];
  for (const guide of data.sectionGuides) {
    if (!guide || typeof guide !== "object") continue;
    const g = guide as Record<string, unknown>;
    const label = typeof g.sectionPath === "string" ? g.sectionPath : "";
    const points = Array.isArray(g.keyPoints) ? g.keyPoints.filter((p): p is string => typeof p === "string") : [];
    const blob = [g.claim, g.evidenceHint, g.purpose, ...points]
      .filter((part): part is string => typeof part === "string")
      .join(" ");
    const nums = [...blob.matchAll(/\[(\d+)\]/g)]
      .map((m) => Number(m[1]))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (!label || nums.length === 0) continue;
    cites.push({ label, cites: [...new Set(nums)] });
  }
  return cites;
}

/**
 * 大纲标题能对上哪些已导入文献。
 * 只认题录/摘要里的实词重叠，或蓝图主张里已经写出的 [n]。对不上就空，不编造。
 */
export function outlineHeadingCoverage(
  heading: string,
  references: readonly string[],
  blueprintCites: readonly OutlineBlueprintCite[] = [],
): number[] {
  const tokens = headingTokens(heading);
  if (tokens.length === 0 || references.length === 0) return [];
  const known = new Set(references.map((_, i) => i + 1));
  const hits = new Set<number>();
  references.forEach((ref, i) => {
    const hay = ref.toLowerCase();
    if (tokens.some((token) => hay.includes(token.toLowerCase()))) hits.add(i + 1);
  });
  const headingLower = heading.toLowerCase();
  for (const cite of blueprintCites) {
    const labelTokens = headingTokens(cite.label);
    const aligned = labelTokens.some((token) => headingLower.includes(token.toLowerCase()))
      || tokens.some((token) => cite.label.toLowerCase().includes(token.toLowerCase()));
    if (!aligned) continue;
    for (const n of cite.cites) {
      if (known.has(n)) hits.add(n);
    }
  }
  return [...hits].sort((a, b) => a - b).slice(0, 6);
}
