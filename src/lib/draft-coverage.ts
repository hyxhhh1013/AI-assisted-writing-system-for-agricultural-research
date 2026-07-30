/**
 * W3-AP-DRAFT-COVER — 期望节完整度评估（warn 级，不阻断写回）
 */

import type {
  DraftCoverageInput,
  DraftCoverageReport,
  DraftSectionCoverage,
  DraftSectionStatus,
  DraftSectionTarget,
} from "@/contracts/draft-coverage";

/** 中文综述期望节 */
const REVIEW_TARGETS_ZH: DraftSectionTarget[] = [
  { key: "introduction", minChars: 1200, thinBelow: 800, required: true },
  {
    key: "background",
    minChars: 1500,
    thinBelow: 900,
    required: true,
    altGroup: "review_body",
  },
  {
    key: "literature_body",
    minChars: 2000,
    thinBelow: 1200,
    required: true,
    altGroup: "review_body",
  },
  { key: "conclusion", minChars: 800, thinBelow: 500, required: true },
  { key: "abstract", minChars: 250, thinBelow: 120, required: false },
];

/** 中文研究型期望节（discussion 推荐） */
const RESEARCH_TARGETS_ZH: DraftSectionTarget[] = [
  { key: "introduction", minChars: 1000, thinBelow: 600, required: true },
  { key: "methods", minChars: 1500, thinBelow: 900, required: true },
  { key: "results", minChars: 1500, thinBelow: 900, required: true },
  { key: "discussion", minChars: 1200, thinBelow: 700, required: false },
  { key: "conclusion", minChars: 600, thinBelow: 350, required: true },
  { key: "abstract", minChars: 250, thinBelow: 120, required: false },
];

function scaleTargets(
  targets: DraftSectionTarget[],
  language: "zh" | "en",
): DraftSectionTarget[] {
  if (language === "zh") return targets;
  // 英文按字符约 0.55（词更长，阈值略降）
  return targets.map((t) => ({
    ...t,
    minChars: Math.round(t.minChars * 0.55),
    thinBelow: Math.round(t.thinBelow * 0.55),
  }));
}

export function getDraftSectionTargets(
  mode: "review" | "research",
  language: "zh" | "en" = "zh",
): DraftSectionTarget[] {
  const base = mode === "research" ? RESEARCH_TARGETS_ZH : REVIEW_TARGETS_ZH;
  return scaleTargets(base, language);
}

function statusFor(
  chars: number,
  thinBelow: number,
  minChars: number,
): DraftSectionStatus {
  if (chars <= 0) return "empty";
  if (chars < thinBelow) return "thin";
  if (chars < minChars) return "thin";
  return "ok";
}

function labelKey(key: string): string {
  const map: Record<string, string> = {
    abstract: "摘要",
    introduction: "引言",
    background: "研究现状",
    literature_body: "进展综述",
    methods: "方法",
    results: "结果",
    discussion: "讨论",
    conclusion: "结论",
  };
  return map[key] ?? key;
}

function altGroupSatisfied(
  group: string,
  coverages: DraftSectionCoverage[],
): boolean {
  return coverages.some((c) => c.altGroup === group && c.status === "ok");
}

function buildHint(report: Omit<DraftCoverageReport, "hint">): string {
  if (report.requiredGaps.length === 0 && report.thinKeys.length === 0) {
    const abs = report.sections.find((s) => s.key === "abstract");
    if (abs && abs.status !== "ok") {
      return `正文必写节已达标；摘要仍${abs.status === "empty" ? "空白" : "偏薄"}，可 write_bilingual_abstract`;
    }
    return `分节完整度良好（必写 ${report.okRequiredCount}/${report.requiredCount}，正文约 ${report.bodyChars} 字）`;
  }
  const parts: string[] = [];
  if (report.requiredGaps.length > 0) {
    parts.push(
      `必写缺口：${report.requiredGaps.map(labelKey).join("、")}`,
    );
  }
  if (report.thinKeys.length > 0) {
    parts.push(`偏薄：${report.thinKeys.map(labelKey).join("、")}`);
  }
  if (report.nextSectionKey) {
    parts.push(`建议下一步 write_section(${report.nextSectionKey})`);
  }
  return parts.join("；");
}

/**
 * 评估项目各期望节是否空白/偏薄。
 */
export function evaluateDraftCoverage(
  input: DraftCoverageInput,
): DraftCoverageReport {
  const language: "zh" | "en" = input.language === "en" ? "en" : "zh";
  const targets = getDraftSectionTargets(input.mode, language);
  const charsMap = input.sectionChars ?? {};

  const sections: DraftSectionCoverage[] = targets.map((t) => {
    const chars = Math.max(0, Math.floor(Number(charsMap[t.key] ?? 0)));
    const status = statusFor(chars, t.thinBelow, t.minChars);
    return {
      key: t.key,
      chars,
      minChars: t.minChars,
      thinBelow: t.thinBelow,
      required: t.required,
      altGroup: t.altGroup,
      status,
      ratio:
        t.minChars > 0
          ? Math.round(Math.min(chars / t.minChars, 2) * 100) / 100
          : 0,
    };
  });

  const emptyKeys = sections.filter((s) => s.status === "empty").map((s) => s.key);
  const thinKeys = sections.filter((s) => s.status === "thin").map((s) => s.key);

  // 必写缺口：无 alt 的 required 非 ok；有 alt 的组整体未满足
  const requiredGaps: string[] = [];
  const seenAlt = new Set<string>();
  for (const s of sections) {
    if (!s.required) continue;
    if (s.altGroup) {
      if (seenAlt.has(s.altGroup)) continue;
      seenAlt.add(s.altGroup);
      if (!altGroupSatisfied(s.altGroup, sections)) {
        // 报告组内最差的优先写的那个
        const group = sections.filter((x) => x.altGroup === s.altGroup);
        const pick =
          group.find((x) => x.status === "empty")
          ?? group.find((x) => x.status === "thin")
          ?? group[0];
        if (pick) requiredGaps.push(pick.key);
      }
    } else if (s.status !== "ok") {
      requiredGaps.push(s.key);
    }
  }

  // requiredCount：无 alt 各算 1；每个 alt 组算 1
  let requiredCount = 0;
  const countedAlt = new Set<string>();
  for (const t of targets) {
    if (!t.required) continue;
    if (t.altGroup) {
      if (countedAlt.has(t.altGroup)) continue;
      countedAlt.add(t.altGroup);
      requiredCount += 1;
    } else {
      requiredCount += 1;
    }
  }

  let okRequiredCount = 0;
  const okAlt = new Set<string>();
  for (const s of sections) {
    if (!s.required) continue;
    if (s.altGroup) {
      if (okAlt.has(s.altGroup)) continue;
      if (altGroupSatisfied(s.altGroup, sections)) {
        okAlt.add(s.altGroup);
        okRequiredCount += 1;
      }
    } else if (s.status === "ok") {
      okRequiredCount += 1;
    }
  }

  const nextSectionKey =
    requiredGaps[0]
    ?? thinKeys.find((k) => k !== "abstract")
    ?? (emptyKeys.includes("abstract") ? "abstract" : null)
    ?? thinKeys[0]
    ?? null;

  const bodyChars = sections
    .filter((s) => s.key !== "abstract")
    .reduce((a, s) => a + s.chars, 0);

  const base = {
    mode: input.mode,
    language,
    sections,
    emptyKeys,
    thinKeys,
    requiredGaps,
    nextSectionKey,
    bodyChars,
    okRequiredCount,
    requiredCount,
  };

  return {
    ...base,
    hint: buildHint(base),
  };
}

/** 从 Agent sectionFills 构造字数字典 */
export function sectionCharsFromFills(
  fills: Array<{ key: string; chars: number }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of fills) {
    out[f.key] = Math.max(0, Math.floor(f.chars || 0));
  }
  return out;
}
