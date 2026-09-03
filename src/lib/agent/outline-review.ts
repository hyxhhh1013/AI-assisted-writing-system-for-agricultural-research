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

export function outlineHeadingChips(
  blocks: readonly OutlineReviewBlock[],
): Array<{ id: string; title: string; level: number }> {
  return blocks
    .filter((b): b is Extract<OutlineReviewBlock, { type: "heading" }> => b.type === "heading")
    .filter((b) => b.level <= 2);
}
