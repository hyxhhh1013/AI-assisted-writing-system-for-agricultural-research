/**
 * W3-AP-WQC 写作质检轻量版（确定性规则，无 LLM 依赖，只取可测子集）。
 *
 * 规则清单（中文）：喉清开场 / 综上所述堆砌 / overclaim / 段长方差过低。
 * 全部 warn 级、默认不阻断写回；overclaim 命中 ≥3 时标 severe，上层可升级到 review。
 * 对应 `docs/plans/W3-AP-QUALITY.md` §S3。
 */

export type WqcRule =
  | "throat_clear"
  | "connective_overuse"
  | "overclaim"
  | "para_variance";

export interface WqcFinding {
  rule: WqcRule;
  severity: "warn";
  /** 命中次数（para_variance 时是段落数） */
  count: number;
  message: string;
  /** 命中的短语示例（至多 3 条；para_variance 无） */
  examples: string[];
  /** overclaim 命中 ≥3 时置 true，供上层转 review */
  severe?: boolean;
}

/** 喉清开场：句首套话，直接进论据更佳 */
const THROAT_CLEAR_PHRASES = [
  "众所周知",
  "值得注意的是",
  "需要注意的是",
  "不言而喻",
  "显而易见",
  "需要指出的是",
  "首先需要指出",
];

/** 结论连接词堆砌 */
const CONNECTIVE_PHRASES = [
  "综上所述",
  "总而言之",
  "总体而言",
  "综上可见",
  "由上可知",
  "总的来说",
  "归结起来",
];

/** overclaim 绝对化表述（避开「完全/彻底」等科研中可能合法的词） */
const OVERCLAIM_PHRASES = [
  "绝对",
  "必定",
  "毫无疑问",
  "毋庸置疑",
  "独一无二",
  "显著优于一切",
  "最佳",
  "最优",
];

/** 各规则告警阈值 */
const THROAT_CLEAR_MIN = 2;
const CONNECTIVE_MIN = 2;
const OVERCLAIM_MIN = 1;
const OVERCLAIM_SEVERE = 3;
/** 段长方差：至少 3 段、平均长度 ≥15、变异系数 <0.15 才告警（避免一句一段误伤） */
const PARA_MIN_COUNT = 3;
const PARA_MIN_MEAN = 15;
const PARA_CV_MAX = 0.15;

function countPhrases(text: string, phrases: string[]): { count: number; examples: string[] } {
  let count = 0;
  const examples: string[] = [];
  for (const phrase of phrases) {
    let idx = 0;
    while ((idx = text.indexOf(phrase, idx)) !== -1) {
      count += 1;
      if (examples.length < 3) examples.push(phrase);
      idx += phrase.length;
    }
  }
  return { count, examples };
}

/**
 * 对一段正文跑确定性写作质检。
 * 返回空数组 = 无发现；否则为 warn 级 findings（不阻断，供观察/提示）。
 */
export function checkWritingQuality(text: string): WqcFinding[] {
  const findings: WqcFinding[] = [];

  const throat = countPhrases(text, THROAT_CLEAR_PHRASES);
  if (throat.count >= THROAT_CLEAR_MIN) {
    findings.push({
      rule: "throat_clear",
      severity: "warn",
      count: throat.count,
      message: `喉清开场（${throat.count} 处：${throat.examples.join("、")}），建议直接进入论据`,
      examples: throat.examples,
    });
  }

  const connective = countPhrases(text, CONNECTIVE_PHRASES);
  if (connective.count >= CONNECTIVE_MIN) {
    findings.push({
      rule: "connective_overuse",
      severity: "warn",
      count: connective.count,
      message: `结论连接词堆砌（${connective.count} 处），建议精简「综上所述/总而言之」类表述`,
      examples: connective.examples,
    });
  }

  const overclaim = countPhrases(text, OVERCLAIM_PHRASES);
  if (overclaim.count >= OVERCLAIM_MIN) {
    findings.push({
      rule: "overclaim",
      severity: "warn",
      count: overclaim.count,
      message: `过度声称（${overclaim.count} 处：${overclaim.examples.join("、")}），建议改用有数据支撑的表述`,
      examples: overclaim.examples,
      ...(overclaim.count >= OVERCLAIM_SEVERE ? { severe: true } : {}),
    });
  }

  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length >= PARA_MIN_COUNT) {
    const lengths = paragraphs.map((p) => p.length);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    if (mean >= PARA_MIN_MEAN) {
      const variance =
        lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length;
      const cv = Math.sqrt(variance) / mean;
      if (cv < PARA_CV_MAX) {
        findings.push({
          rule: "para_variance",
          severity: "warn",
          count: paragraphs.length,
          message: `段落长度过于均匀（${paragraphs.length} 段，CV=${cv.toFixed(2)}），可能是机械堆砌`,
          examples: [],
        });
      }
    }
  }

  return findings;
}
