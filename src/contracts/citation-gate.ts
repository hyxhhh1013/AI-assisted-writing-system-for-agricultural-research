/**
 * W3-CITE-GATE — 导出前引用编号硬检
 */

export interface CitationGateInput {
  /** 摘要 + 各章节正文 */
  texts: string[];
  refCount: number;
}

export interface CitationGateResult {
  /**
   * Phase 5 完成条件：有文献、无越界、正文至少一处 [n]
   * （与 exportReady 分离）
   */
  passed: boolean;
  /**
   * 可导出 / 可过稿硬检：有文献且无越界编号
   * （不要求正文已有引用，避免拦中间稿）
   */
  exportReady: boolean;
  refCount: number;
  citationCount: number;
  uniqueNumbers: number[];
  outOfBounds: number[];
  /** 文献表有、正文从未出现的编号（1 基） */
  unusedCount: number;
  unusedIndexes: number[];
  hint: string;
}

export function buildCitationGateHint(result: Omit<CitationGateResult, "hint">): string {
  if (result.refCount <= 0) {
    return "尚无参考文献：请先导入文献后再核对引用编号";
  }
  if (result.outOfBounds.length > 0) {
    return `发现越界引用编号 [${result.outOfBounds.join(", ")}]（参考文献共 ${result.refCount} 条），无法标「可过稿」`;
  }
  if (result.citationCount === 0) {
    return `无越界引用（参考文献 ${result.refCount} 条）；正文尚无 [n]，Phase 5 未完成，但可导出中间稿`;
  }
  if (result.unusedCount > 0) {
    const sample = result.unusedIndexes.slice(0, 12).join(", ");
    const more = result.unusedCount > 12 ? "…" : "";
    return (
      `编号无越界，但文献表 ${result.refCount} 条、正文只引用 ${result.uniqueNumbers.length} 条；`
      + `未引用 [${sample}${more}]。交付前应删未引用或补引进正文，不要把未引文献留在表里`
    );
  }
  return `引用编号合规（${result.citationCount} 处，最大编号 ≤ ${result.refCount}），可标「可过稿」`;
}
