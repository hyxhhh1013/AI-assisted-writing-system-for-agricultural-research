export type QualityStation = "overview" | "check" | "rewrite" | "review";

/** 兼容旧 URL：overview / result / history / check */
export function parseQualityTab(raw: string | null): QualityStation {
  if (raw === "rewrite" || raw === "review") return raw;
  if (raw === "check" || raw === "result") return "check";
  return "overview";
}

export function shouldOpenCheckResult(raw: string | null): boolean {
  return raw === "result" || raw === "check";
}

export function isHistoryTab(raw: string | null): boolean {
  return raw === "history";
}

/** @deprecated 使用 QualityStation；保留以免旧 import 断裂 */
export type QualityTab = QualityStation | "history";
