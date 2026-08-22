/**
 * 结果章数字对账：正文里精确到小数的新数必须能对上 dataClaims。
 * 「约 / 数量级 / 左右」灰区不拦。
 */

import type { EvidenceClaim } from "@/contracts/data-source";

const DECIMAL_RE = /(?<![.\d])(\d+\.\d+)(?!\d)/g;
const HEDGE_RE = /约|大约|近|左右|数量级|~|≈/;
/** 图/表号、p 值、相关系数：不是新编造的试验结果 */
const STRUCTURAL_NUMBER_RE =
  /图\s*|表\s*|Fig(?:ure)?\.?\s*|Tab(?:le)?\.?\s*|式\s*|附录|[Pp]\s*[=<>＜＞≤≥]|[Rr]²|[Rr]\s*=/;

export interface ResultNumberHit {
  raw: string;
  value: number;
  index: number;
}

export interface ResultsNumberReconcileFail {
  ok: false;
  offenders: ResultNumberHit[];
  message: string;
}

export interface ResultsNumberReconcilePass {
  ok: true;
}

export type ResultsNumberReconcileResult =
  | ResultsNumberReconcilePass
  | ResultsNumberReconcileFail;

export function extractPreciseResultNumbers(text: string): ResultNumberHit[] {
  const hits: ResultNumberHit[] = [];
  const re = new RegExp(DECIMAL_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1];
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const start = m.index;
    const window = text.slice(Math.max(0, start - 8), start + raw.length + 8);
    if (HEDGE_RE.test(window) || STRUCTURAL_NUMBER_RE.test(window)) continue;
    hits.push({ raw, value, index: start });
  }
  return hits;
}

function claimNumericValues(claim: EvidenceClaim): { value: number; tolerance: number }[] {
  const out: { value: number; tolerance: number }[] = [];
  const tol = typeof claim.tolerance === "number" && claim.tolerance > 0 ? claim.tolerance : 5;
  for (const v of Object.values(claim.values ?? {})) {
    if (typeof v === "number" && Number.isFinite(v)) {
      out.push({ value: v, tolerance: tol });
    } else if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) {
      out.push({ value: Number(v), tolerance: tol });
    }
  }
  if (typeof claim.pValue === "number" && Number.isFinite(claim.pValue)) {
    out.push({ value: claim.pValue, tolerance: tol });
  }
  return out;
}

export function numberMatchesClaims(
  value: number,
  claims: EvidenceClaim[],
): boolean {
  for (const claim of claims) {
    for (const allowed of claimNumericValues(claim)) {
      const rel = allowed.tolerance / 100;
      const absTol = Math.max(Math.abs(allowed.value) * rel, 1e-6);
      if (Math.abs(value - allowed.value) <= absTol) return true;
    }
  }
  return false;
}

export function reconcileResultsNumbers(
  text: string,
  claims: EvidenceClaim[],
): ResultsNumberReconcileResult {
  const numerics = claims.flatMap(claimNumericValues);
  if (numerics.length === 0) return { ok: true };

  const hits = extractPreciseResultNumbers(text);
  const offenders = hits.filter((h) => !numberMatchesClaims(h.value, claims));
  if (offenders.length === 0) return { ok: true };

  const listed = [...new Set(offenders.map((o) => o.raw))].join("、");
  return {
    ok: false,
    offenders,
    message:
      `结果章出现未在数据声明中的精确数字：${listed}。`
      + "请只写 dataClaims 里有的数，或先 ingest 更新声明；约/数量级表述可不改。",
  };
}
