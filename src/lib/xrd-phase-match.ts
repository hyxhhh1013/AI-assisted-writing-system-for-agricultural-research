import fs from "fs";
import path from "path";

export interface PhaseRefPeak {
  two_theta: number;
  hkl: string;
  relative: number;
}

export interface PhaseReference {
  id: string;
  name: string;
  formula: string;
  peaks: PhaseRefPeak[];
}

export interface ExpPeakInput {
  two_theta: number;
  intensity?: number;
  relative_intensity?: number;
}

export interface MatchedRefPeak {
  hkl: string;
  two_theta_ref: number;
  two_theta_exp: number;
  delta: number;
}

export interface PhaseMatchResult {
  phase_id: string;
  name: string;
  formula: string;
  score: number;
  matched_count: number;
  ref_peak_count: number;
  matched_peaks: MatchedRefPeak[];
}

export interface PhaseSearchOptions {
  tolerance_deg?: number;
  top_k?: number;
  min_score?: number;
  max_ref_peaks?: number;
}

const DEFAULT_TOLERANCE = 0.25;
const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SCORE = 0.15;
const DEFAULT_MAX_REF_PEAKS = 8;

const REF_PATH = path.join(process.cwd(), "data", "xrd", "phase-reference.json");

let catalogCache: PhaseReference[] | null = null;

function loadPhaseCatalog(): PhaseReference[] {
  if (catalogCache) return catalogCache;
  const raw = fs.readFileSync(REF_PATH, "utf-8");
  const parsed = JSON.parse(raw) as { phases?: PhaseReference[] };
  catalogCache = Array.isArray(parsed.phases) ? parsed.phases : [];
  return catalogCache;
}

/** 测试或热重载时清空缓存 */
export function resetPhaseCatalogCache(): void {
  catalogCache = null;
}

function scorePhase(
  expPeaks: ExpPeakInput[],
  phase: PhaseReference,
  tolerance: number,
  maxRefPeaks: number,
): PhaseMatchResult {
  const refSorted = [...phase.peaks]
    .sort((a, b) => b.relative - a.relative)
    .slice(0, maxRefPeaks);
  const totalWeight = refSorted.reduce((s, p) => s + p.relative, 0) || 1;

  const matched: MatchedRefPeak[] = [];
  let matchedWeight = 0;

  for (const ref of refSorted) {
    let best: { exp: ExpPeakInput; delta: number } | null = null;
    for (const exp of expPeaks) {
      const delta = Math.abs(exp.two_theta - ref.two_theta);
      if (delta <= tolerance && (!best || delta < best.delta)) {
        best = { exp, delta };
      }
    }
    if (best) {
      matchedWeight += ref.relative;
      matched.push({
        hkl: ref.hkl,
        two_theta_ref: ref.two_theta,
        two_theta_exp: best.exp.two_theta,
        delta: best.delta,
      });
    }
  }

  return {
    phase_id: phase.id,
    name: phase.name,
    formula: phase.formula,
    score: matchedWeight / totalWeight,
    matched_count: matched.length,
    ref_peak_count: refSorted.length,
    matched_peaks: matched,
  };
}

/** 实验峰位与内置参考相库匹配（Jade 式加权峰匹配 MVP） */
export function matchXrdPhases(
  expPeaks: ExpPeakInput[],
  options: PhaseSearchOptions = {},
): PhaseMatchResult[] {
  if (expPeaks.length === 0) return [];

  const tolerance = options.tolerance_deg ?? DEFAULT_TOLERANCE;
  const topK = options.top_k ?? DEFAULT_TOP_K;
  const minScore = options.min_score ?? DEFAULT_MIN_SCORE;
  const maxRefPeaks = options.max_ref_peaks ?? DEFAULT_MAX_REF_PEAKS;

  const catalog = loadPhaseCatalog();
  const rankScore = (r: PhaseMatchResult) =>
    r.score + 0.05 * Math.max(0, r.matched_count - 2);

  const results = catalog
    .map((phase) => scorePhase(expPeaks, phase, tolerance, maxRefPeaks))
    .filter((r) => r.score >= minScore && r.matched_count >= 2)
    .sort(
      (a, b) =>
        rankScore(b) - rankScore(a) || b.matched_count - a.matched_count,
    );

  return results.slice(0, topK);
}

export function listPhaseCatalog(): PhaseReference[] {
  return loadPhaseCatalog();
}
