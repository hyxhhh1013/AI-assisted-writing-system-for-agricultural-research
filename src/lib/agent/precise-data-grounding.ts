/**
 * bib_only 精确数据告警（W3-AP-ARCH-04 探路）。
 *
 * 目标：正文对「无全文、无摘要」（bib_only）的文献标了 [n]，且该句含精确数据
 * （数字+单位 / 百分数 / 温度）时，提示「数据无源可核」，引导补原文或改定性表述。
 *
 * 确定性规则，不依赖 LLM；软信号，不阻断 exportReady（硬检仍是 citation-gate 的越界判断）。
 * 精确数据只认「数字+单位」，天然排除年份（19xx/20xx 无单位）与纯编号/纯小数，
 * 避免误伤「in 2020」「[3]」「3 篇文献」这类非数据表述。
 */

import {
  CITATION_GROUP_RE,
  expandCitationGroup,
  normalizeAllCitationFormats,
} from "@/lib/citation";
import { extractCitationContext } from "@/lib/citation-grounding";

/** 数字：整数 / 小数（科学计数法与全角数字暂不覆盖，核心场景够用） */
const NUM = "\\d+(?:\\.\\d+)?";

/** 复合单位（含 / 或 ·，最具体优先，防被简单单位截断） */
const COMPOUND_UNITS = [
  "mg/g", "μg/g", "mg/kg", "μg/kg", "kJ/mol", "J/mol", "mmol/L",
  "μmol/L", "mol/L", "g/L", "mg/L", "μg/L", "mL/min", "m²/g", "m2/g",
  "mg·g⁻¹", "μg·g⁻¹",
].join("|");

/** 温度单位（全角/特殊字符，无英文单词边界问题） */
const TEMP_UNITS = "℃|°C|°F|K";

/** 简单单位：末位负向前瞻防截断复合单位 / 英文单词（如 3 groups、5 samples） */
const SIMPLE_UNITS = [
  "mg", "μg", "g", "kg", "mL", "L", "μL", "nm", "μm", "mm", "cm", "m",
  "kDa", "Da", "kJ", "MJ", "eV", "keV", "mol", "mmol", "μmol",
  "min", "h", "d", "s", "Pa", "kPa", "MPa", "GPa", "ppm", "ppb",
  "M", "mM", "μM",
].join("|");

const PRECISE_DATA_RES: RegExp[] = [
  new RegExp(`${NUM}\\s*(?:${COMPOUND_UNITS})`, "g"),
  new RegExp(`${NUM}\\s*(?:${TEMP_UNITS})`, "g"),
  new RegExp(`${NUM}\\s*(?:${SIMPLE_UNITS})(?![a-zA-Z/·])`, "g"),
  new RegExp(`${NUM}\\s*[%％]`, "g"),
];

/** 从一句话里提取精确数据样本（去重，保序） */
export function extractPreciseData(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const re of PRECISE_DATA_RES) {
    for (const m of text.matchAll(re)) {
      const raw = m[0].trim();
      const key = raw.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        found.push(raw);
      }
    }
  }
  return found;
}

export interface BibOnlyPreciseDataFinding {
  /** 1-based 引用编号 */
  number: number;
  /** 命中精确数据样本（去重，最多 4 个） */
  data: string[];
  /** 含 [n] 的引用句（截断） */
  sentence: string;
}

/**
 * 扫全文，找出「bib_only 文献被引用且该句含精确数据」的编号。
 * @param bibOnlyIndexes 1-based、判定为 bib_only（无全文无摘要）的编号集合
 */
export function evaluateBibOnlyPreciseData(params: {
  draftText: string;
  bibOnlyIndexes: ReadonlySet<number>;
}): BibOnlyPreciseDataFinding[] {
  const { draftText, bibOnlyIndexes } = params;
  const normalized = normalizeAllCitationFormats(draftText);
  const byNumber = new Map<number, BibOnlyPreciseDataFinding>();

  const re = new RegExp(CITATION_GROUP_RE.source, CITATION_GROUP_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    const sentence = extractCitationContext(normalized, m.index);
    const nums = expandCitationGroup(m[1]);
    for (const num of nums) {
      if (num < 1 || !bibOnlyIndexes.has(num)) continue;
      if (byNumber.has(num)) continue;
      const data = extractPreciseData(sentence);
      if (data.length === 0) continue;
      byNumber.set(num, {
        number: num,
        data: data.slice(0, 4),
        sentence: sentence.slice(0, 160),
      });
    }
  }

  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

/** 导出 / validate_citations 共用的软告警文案（不阻断 exportReady） */
export function formatBibOnlyPreciseWarning(
  findings: readonly BibOnlyPreciseDataFinding[],
): string {
  if (findings.length === 0) return "";
  const sample = findings
    .slice(0, 5)
    .map((f) => `[${f.number}]（${f.data.join("、")}）`)
    .join("，");
  return (
    `仅书目文献含精确数据 ${findings.length} 处：${sample}。`
    + `建议补原文或改定性表述（不阻断导出）。`
  );
}
