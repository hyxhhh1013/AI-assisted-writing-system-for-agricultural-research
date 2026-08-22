/**
 * Wave 4 — 导出前就绪检查（引用硬检 + bib_only 精确数据软告警）
 *
 * 本文件必须保持浏览器可导入（无 fs / prisma / rag）。
 * 需解析 bib_only 编号时用 `export-readiness-server.ts` 的 async 版。
 */

import { evaluateCitationGate } from "@/lib/citation-gate";
import type { CitationGateResult } from "@/contracts/citation-gate";
import type { ProjectData } from "@/contracts/project";
import { parsePaperPassport } from "@/contracts/paper-passport";
import { parseProjectCharts, type ProjectChartAsset } from "@/contracts/figure";
import {
  evaluateBibOnlyPreciseData,
  formatBibOnlyPreciseWarning,
  type BibOnlyPreciseDataFinding,
} from "@/lib/agent/precise-data-grounding";

export interface ExportReadiness {
  ok: boolean;
  gate: CitationGateResult;
  /** Passport 对照语言摘要（若有） */
  counterpartAbstract: { lang: "zh" | "en"; text: string } | null;
  chartAssets: ProjectChartAsset[];
  /**
   * 软警告（不阻断 ok）。含 bib_only 精确数据等。
   * Word/PDF 导出前 toast；硬检仍只看 citation-gate。
   */
  warnings: string[];
  /** bib_only + 精确数据命中（结构化，供前端/API） */
  bibOnlyPrecise: BibOnlyPreciseDataFinding[];
}

export interface AssessExportReadinessOptions {
  /** 1-based bib_only 编号；缺省则不做精确数据软检 */
  bibOnlyIndexes?: ReadonlySet<number>;
}

function collectProjectTexts(project: ProjectData): string[] {
  return [project.abstract ?? "", ...Object.values(project.sections ?? {})];
}

export function assessExportReadiness(
  project: ProjectData,
  options?: AssessExportReadinessOptions,
): ExportReadiness {
  const texts = collectProjectTexts(project);
  const gate = evaluateCitationGate({
    texts,
    refCount: Array.isArray(project.references) ? project.references.length : 0,
  });

  const passport = parsePaperPassport(project.paperPassport);
  const primary = project.language === "en" ? "en" : "zh";
  let counterpartAbstract: ExportReadiness["counterpartAbstract"] = null;
  if (passport?.abstractSnapshot) {
    const otherLang = primary === "en" ? "zh" : "en";
    const text =
      otherLang === "en"
        ? passport.abstractSnapshot.en?.trim() || ""
        : passport.abstractSnapshot.zh?.trim() || "";
    if (text) counterpartAbstract = { lang: otherLang, text };
  }

  const warnings: string[] = [];
  let bibOnlyPrecise: BibOnlyPreciseDataFinding[] = [];
  const bibOnlyIndexes = options?.bibOnlyIndexes;
  if (bibOnlyIndexes && bibOnlyIndexes.size > 0) {
    bibOnlyPrecise = evaluateBibOnlyPreciseData({
      draftText: texts.join("\n\n"),
      bibOnlyIndexes,
    });
    const warn = formatBibOnlyPreciseWarning(bibOnlyPrecise);
    if (warn) warnings.push(warn);
  }

  return {
    ok: gate.exportReady,
    gate,
    counterpartAbstract,
    chartAssets: parseProjectCharts(project.charts),
    warnings,
    bibOnlyPrecise,
  };
}
