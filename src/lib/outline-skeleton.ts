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
