/**
 * 质量评测聚合：四个维度加权得到 overallScore（0-100）。
 * 权重向「引用支撑」倾斜——它是论文「可不可信」的最强信号。
 */

import {
  checkCitation,
  checkConsistency,
  checkOverclaim,
  checkStructure,
} from "./checks";
import type {
  QualityDimensionKey,
  QualityEvalInput,
  QualityEvalReport,
} from "./types";

const WEIGHTS: Record<QualityDimensionKey, number> = {
  structure: 0.25,
  citation: 0.35,
  consistency: 0.25,
  overclaim: 0.15,
};

export function evaluateQuality(input: QualityEvalInput): QualityEvalReport {
  const dimensions = [
    checkStructure(input.sections),
    checkCitation(input.sections, input.references),
    checkConsistency(input.sections),
    checkOverclaim(input.sections),
  ];

  const overallScore = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * WEIGHTS[d.key], 0),
  );

  return {
    dimensions,
    overallScore,
    issues: dimensions.flatMap((d) => d.issues.map((i) => `[${d.label}] ${i}`)),
    strengths: dimensions.flatMap((d) =>
      d.strengths.map((s) => `[${d.label}] ${s}`),
    ),
    createdAt: new Date().toISOString(),
  };
}

export { WEIGHTS };
