import type { ProjectWritingMode } from "@/contracts/writing-mode";

export const DEFAULT_REVIEW_SKELETON = [
  "摘要",
  "引言",
  "研究现状与问题",
  "研究进展综述",
  "结论与展望",
] as const;

export const DEFAULT_RESEARCH_SKELETON = [
  "摘要",
  "引言",
  "材料与方法",
  "结果与分析",
  "结论",
] as const;

/** 综述一级标题中禁止出现的 IMRaD 试验章节名 */
const FORBIDDEN_REVIEW_LEVEL1 =
  /材料与方法|结果与分析|结果与讨论|试验设计|Materials\s*and\s*Methods|Results?\s*and\s*Discussion/i;

/** 研究论文一级标题中不应出现的综述专有章节名 */
const FORBIDDEN_RESEARCH_LEVEL1 = /研究现状与问题|研究进展综述|文献综述主体/i;

export function getDefaultUserSkeleton(mode: ProjectWritingMode): string[] {
  return mode === "research"
    ? [...DEFAULT_RESEARCH_SKELETON]
    : [...DEFAULT_REVIEW_SKELETON];
}

export function parseSkeletonLines(text: string): string[] {
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function formatSkeletonLines(lines: readonly string[]): string {
  return lines.join("\n");
}

/** 骨架是否与写作模式明显冲突（如综述却写了「材料与方法」） */
export function skeletonConflictsWithMode(
  skeleton: readonly string[],
  mode: ProjectWritingMode,
): boolean {
  const joined = skeleton.join("\n");
  if (mode === "review") return FORBIDDEN_REVIEW_LEVEL1.test(joined);
  return FORBIDDEN_RESEARCH_LEVEL1.test(joined);
}

/**
 * 将生成大纲的一级标题（## ）按顺序纠偏到用户骨架名称。
 * 保留标题后的破折号/冒号说明；不改动 ### 子节。
 */
export function enforceOutlineAgainstSkeleton(
  markdown: string,
  skeleton: readonly string[],
): string {
  if (!markdown.trim() || skeleton.length === 0) return markdown;
  let h2Index = 0;
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^##\s+(?!#)(.+)$/);
      if (!m) return line;
      if (h2Index >= skeleton.length) return line;
      const desired = skeleton[h2Index];
      h2Index += 1;
      const rest = m[1].trim();
      // 仅保留名称之后的说明段（— / : 等）
      const explain = rest.match(/\s*([—–\-:：].*)$/);
      return explain ? `## ${desired}${explain[1]}` : `## ${desired}`;
    })
    .join("\n");
}

/** 综述大纲若仍残留试验章节名，用骨架对应位替换（兜底） */
export function scrubForbiddenReviewHeadings(
  markdown: string,
  skeleton: readonly string[] = DEFAULT_REVIEW_SKELETON,
): string {
  let h2Index = 0;
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^##\s+(?!#)(.+)$/);
      if (!m) return line;
      const title = m[1].trim();
      const idx = h2Index;
      h2Index += 1;
      if (!FORBIDDEN_REVIEW_LEVEL1.test(title)) return line;
      const fallback =
        skeleton[idx] ??
        DEFAULT_REVIEW_SKELETON[Math.min(idx, DEFAULT_REVIEW_SKELETON.length - 1)] ??
        "研究进展综述";
      const explain = title.match(/\s*([—–\-:：].*)$/);
      return explain ? `## ${fallback}${explain[1]}` : `## ${fallback}`;
    })
    .join("\n");
}
