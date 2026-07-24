import {
  buildCitationGateHint,
  type CitationGateInput,
  type CitationGateResult,
} from "@/contracts/citation-gate";
import {
  CITATION_GROUP_RE,
  expandCitationGroup,
  markOutOfBoundsCitations,
  normalizeAllCitationFormats,
} from "@/lib/citation";

function collectUniqueNumbers(text: string): number[] {
  const set = new Set<number>();
  const normalized = normalizeAllCitationFormats(text);
  let m: RegExpExecArray | null;
  const re = new RegExp(CITATION_GROUP_RE.source, CITATION_GROUP_RE.flags);
  while ((m = re.exec(normalized)) !== null) {
    for (const n of expandCitationGroup(m[1])) {
      if (n >= 1) set.add(n);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * 全稿引用硬检。
 * - exportReady：有文献 + 无越界（导出用）
 * - passed：exportReady + 至少一处文内引用（Passport Phase 5）
 * - 禁止用「正文最大编号」伪装 refCount；调用方必须传入真实文献数
 */
export function evaluateCitationGate(input: CitationGateInput): CitationGateResult {
  const refCount = Math.max(0, Math.floor(input.refCount));
  const joined = input.texts.filter((t) => t?.trim()).join("\n\n");
  const uniqueNumbers = collectUniqueNumbers(joined);

  // refCount=0 时 markOutOfBounds 会跳过；显式把所有编号视为越界
  let outOfBounds: number[];
  if (refCount <= 0) {
    outOfBounds = uniqueNumbers.slice();
  } else {
    outOfBounds = markOutOfBoundsCitations(joined, refCount).outOfBounds;
  }

  let citationCount = 0;
  const normalized = normalizeAllCitationFormats(joined);
  const re = new RegExp(CITATION_GROUP_RE.source, CITATION_GROUP_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    citationCount += expandCitationGroup(m[1]).length;
  }

  const exportReady = refCount > 0 && outOfBounds.length === 0;
  const passed = exportReady && citationCount > 0;
  const base = {
    passed,
    exportReady,
    refCount,
    citationCount,
    uniqueNumbers,
    outOfBounds,
  };

  return {
    ...base,
    hint: buildCitationGateHint(base),
  };
}
