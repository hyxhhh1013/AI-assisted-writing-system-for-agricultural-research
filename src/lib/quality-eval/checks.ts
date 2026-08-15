/**
 * 质量评测的四个确定性检查（纯函数，可进 CI，不依赖 LLM）。
 * 每项返回 { score(0-100), issues, strengths }。
 */

import { evaluateCitationGate } from "@/lib/citation-gate";
import { evaluateCitationGrounding } from "@/lib/citation-grounding";
import type {
  QualityDimensionResult,
  QualityReference,
  QualitySection,
} from "./types";

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function charCount(s: string): number {
  return s.replace(/\s+/g, "").length;
}

function byKey(sections: QualitySection[]): Map<string, QualitySection> {
  return new Map(sections.map((s) => [s.key, s]));
}

// ── 结构完整性 ──────────────────────────────────────────────

const REQUIRED: Array<{ key: string; minChars: number; label: string }> = [
  { key: "abstract", minChars: 150, label: "摘要" },
  { key: "introduction", minChars: 400, label: "引言" },
  { key: "conclusion", minChars: 150, label: "结论" },
];

const BODY_KEYS = ["methods", "results", "discussion", "literature_body"] as const;

export function checkStructure(sections: QualitySection[]): QualityDimensionResult {
  const issues: string[] = [];
  const strengths: string[] = [];
  const map = byKey(sections);

  // 3 个必选节各 1 分 + 主体节最多 2 分
  const total = REQUIRED.length + 2;
  let earned = 0;

  for (const req of REQUIRED) {
    const sec = map.get(req.key);
    const chars = sec ? charCount(sec.content) : 0;
    if (sec && chars >= req.minChars) {
      earned += 1;
      strengths.push(`${req.label}篇幅充足（${chars}字）`);
    } else if (sec) {
      issues.push(`${req.label}偏短（${chars}字，需 ≥${req.minChars}）`);
    } else {
      issues.push(`缺少${req.label}（${req.key}）`);
    }
  }

  const bodyCount = BODY_KEYS.filter(
    (k) => charCount(map.get(k)?.content ?? "") >= 300,
  ).length;
  earned += Math.min(bodyCount, 2);
  if (bodyCount === 0) {
    issues.push("正文主体节（方法/结果/讨论/综述正文）缺失或过短");
  } else if (bodyCount === 1) {
    issues.push("正文主体节仅 1 节，研究论文通常需要方法+结果+讨论");
  } else {
    strengths.push(`正文主体节 ${bodyCount} 节`);
  }

  return {
    key: "structure",
    label: "结构完整性",
    score: clamp((earned / total) * 100),
    issues,
    strengths,
  };
}

// ── 引用支撑 ────────────────────────────────────────────────

export function checkCitation(
  sections: QualitySection[],
  references: QualityReference[],
): QualityDimensionResult {
  const issues: string[] = [];
  const strengths: string[] = [];
  const body = sections
    .filter((s) => s.key !== "abstract")
    .map((s) => s.content)
    .join("\n\n");

  const gate = evaluateCitationGate({ texts: [body], refCount: references.length });
  const grounding = evaluateCitationGrounding({
    draftText: body,
    references: references.map((r) => ({
      index: r.index,
      title: r.title,
      abstract: r.abstract,
      content: r.content,
    })),
  });

  let score = 100;

  if (gate.citationCount === 0) {
    score = 0;
    issues.push("正文无文内引用 [n]");
  } else {
    strengths.push(
      `文内引用 ${gate.citationCount} 处（去重编号 ${gate.uniqueNumbers.length} 个）`,
    );
  }

  if (references.length === 0) {
    issues.push("参考文献表为空");
  }

  if (gate.outOfBounds.length > 0) {
    score -= 40;
    issues.push(
      `越界引用: [${gate.outOfBounds.join(", ")}]（文献池共 ${references.length} 条）`,
    );
  }

  if (grounding.checkedCount > 0) {
    const suspiciousRatio = grounding.suspiciousCount / grounding.checkedCount;
    score -= Math.round(suspiciousRatio * 60);
    if (suspiciousRatio > 0) {
      issues.push(
        `语义接地可疑 ${grounding.suspiciousCount}/${grounding.checkedCount} 个编号与对应题录/摘要词重叠偏低`,
      );
    }
    strengths.push(
      `引用词重叠支撑率约 ${Math.round((1 - suspiciousRatio) * 100)}%（checked=${grounding.checkedCount}）`,
    );
  }

  return { key: "citation", label: "引用支撑", score: clamp(score), issues, strengths };
}

// ── 跨节一致性（数据-结论回扣 + 方法-结果术语连续性）─────────

/** 数值+单位（结果节的关键信号） */
const NUMERIC_RE = /\d+(?:\.\d+)?\s*(?:%|％|nm|μm|µg|mg|g\/L|mmol|°C|℃|kg\/ha|m2|ha)/g;

/** 英文术语（中文论文里化学式/方法名通常保留英文，用于跨节术语连续性） */
function extractEnglishTerms(text: string): Set<string> {
  const terms = new Set<string>();
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9-]{2,}/g)) {
    terms.add(m[0].toLowerCase());
  }
  return terms;
}

export function checkConsistency(sections: QualitySection[]): QualityDimensionResult {
  const issues: string[] = [];
  const strengths: string[] = [];
  const map = byKey(sections);
  const results = map.get("results") ?? map.get("literature_body");
  const conclusion = map.get("conclusion");
  const methods = map.get("methods");

  let score = 100;

  // 数据-结论：结果有数值结论，结论却一个数字/关键术语都没回扣 → 脱节风险
  if (results && conclusion) {
    const resNums = results.content.match(NUMERIC_RE) ?? [];
    const conNums = conclusion.content.match(NUMERIC_RE) ?? [];
    const resTerms = extractEnglishTerms(results.content);
    const conTerms = extractEnglishTerms(conclusion.content);
    const overlap = [...resTerms].filter((t) => conTerms.has(t)).length;

    if (resNums.length >= 2 && conNums.length === 0 && overlap === 0) {
      score -= 30;
      issues.push("结果节含数值结论，但结论节未回扣任何数值或关键术语，存在数据-结论脱节风险");
    } else if (resNums.length >= 2 && (conNums.length > 0 || overlap > 0)) {
      strengths.push("结论节回扣了结果数据/关键术语");
    }
  }

  // 方法-结果连续性：方法节术语一个都没在结果出现 → 方法与结果脱节
  if (methods && results) {
    const mTerms = extractEnglishTerms(methods.content);
    const rTerms = extractEnglishTerms(results.content);
    const missing = [...mTerms].filter((t) => !rTerms.has(t));
    if (mTerms.size >= 3 && missing.length === mTerms.size) {
      score -= 20;
      issues.push("方法节英文术语未在结果节出现，方法与结果可能脱节");
    }
  }

  return { key: "consistency", label: "跨节一致性", score: clamp(score), issues, strengths };
}

// ── 结论语气克制（overclaim vs hedge）────────────────────────

/** 保守的 overclaim 措辞（弱语气信号，命中仅扣分，不硬断） */
const OVERCLAIM_RE =
  /首次|首创|唯一|独创|颠覆|革命性|重大突破|最优|最佳|国际领先|填补空白|彻底解决|完全消除|毫无/g;

const HEDGE_RE = /可能|或许|表明|提示|倾向于|有待|尚需|初步|推测|似乎/g;

export function checkOverclaim(sections: QualitySection[]): QualityDimensionResult {
  const issues: string[] = [];
  const strengths: string[] = [];
  const full = sections.map((s) => s.content).join("\n\n");
  const overclaims = full.match(OVERCLAIM_RE) ?? [];
  const hedges = full.match(HEDGE_RE) ?? [];

  const score = 100 - Math.min(overclaims.length * 15, 60);
  if (overclaims.length > 0) {
    issues.push(
      `overclaim 措辞 ${overclaims.length} 处：${[...new Set(overclaims)].slice(0, 5).join("、")}`,
    );
  }
  if (hedges.length >= 3) {
    strengths.push(`语气克制（含 ${hedges.length} 处 hedge 措辞）`);
  } else if (overclaims.length === 0) {
    strengths.push("未见明显 overclaim 措辞");
  }

  return { key: "overclaim", label: "结论语气克制", score: clamp(score), issues, strengths };
}
