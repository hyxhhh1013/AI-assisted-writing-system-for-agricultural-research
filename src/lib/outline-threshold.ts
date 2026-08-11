/**
 * 大纲「可用」最短字数。
 * 写门禁（phase-gates / ensure-write-prereqs）与 Passport Phase 2 共用，避免 20 vs 80 漂移。
 */
export const MIN_OUTLINE_CHARS = 20;

export function isOutlineReady(outline: string): boolean {
  return outline.trim().length >= MIN_OUTLINE_CHARS;
}
