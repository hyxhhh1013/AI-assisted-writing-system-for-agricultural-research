import type { PlagiarismMatchType } from "@/contracts/plagiarism";

export const MATCH_ICONS: Record<PlagiarismMatchType, string> = {
  self: "📄",
  cross: "📚",
  local: "📖",
  web: "🌐",
  ai: "🤖",
};

export const MATCH_TYPE_LABELS: Record<PlagiarismMatchType, string> = {
  self: "自引",
  cross: "跨项目",
  local: "知识库",
  web: "联网",
  ai: "AI",
};

export const STRATEGY_LABELS: Record<string, string> = {
  synonym: "同义替换",
  rephrase: "改写语序",
  summarize: "概括精简",
  expand: "扩写重组",
};

export function riskBadgeClass(risk: string): string {
  if (risk === "high") return "text-red-600 bg-red-50";
  if (risk === "medium") return "text-amber-600 bg-amber-50";
  return "text-green-600 bg-green-50";
}

export function riskLabel(risk: string): string {
  if (risk === "high") return "高风险";
  if (risk === "medium") return "中风险";
  return "低风险";
}

export function riskDotClass(risk: string): string {
  if (risk === "high") return "bg-red-500";
  if (risk === "medium") return "bg-amber-500";
  return "bg-green-500";
}
