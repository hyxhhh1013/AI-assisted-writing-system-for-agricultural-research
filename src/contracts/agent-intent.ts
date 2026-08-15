/**
 * Agent 会话意图 — 快照可持久化的单一 kind。
 * 口语正则仍在 goal-intents；本文件只放枚举与守卫。
 */

export const INTENT_KINDS = [
  "pipeline_fix",
  "pipeline_abstract",
  "pipeline_review",
  "pipeline_check",
  "citation_apply",
  "abstract_finish",
  "review_request",
  "literature",
  "draft",
  "review_write",
  "citation",
  "diagnose",
  "classify",
  "ap_full",
] as const;

export type IntentKind = (typeof INTENT_KINDS)[number];

/** 有 nudge/stopAsk 闭包的 kind（不含会话级 diagnose/classify/ap_full） */
export type IntentClosureKind = Exclude<
  IntentKind,
  "diagnose" | "classify" | "ap_full"
>;

export function isIntentKind(value: unknown): value is IntentKind {
  return typeof value === "string" && (INTENT_KINDS as readonly string[]).includes(value);
}
