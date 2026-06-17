export type QualityTab = "check" | "rewrite" | "review" | "history";

/** 兼容旧 URL：overview / result 映射到查重 */
export function parseQualityTab(raw: string | null): QualityTab {
  if (raw === "rewrite" || raw === "review" || raw === "history") return raw;
  return "check";
}

export function shouldOpenCheckResult(raw: string | null): boolean {
  return raw === "result" || raw === "overview";
}
