/**
 * Wave 4 — 导出前就绪检查（引用硬检等）
 */

import { evaluateCitationGate } from "@/lib/citation-gate";
import type { CitationGateResult } from "@/contracts/citation-gate";
import type { ProjectData } from "@/contracts/project";
import { parsePaperPassport } from "@/contracts/paper-passport";
import { parseProjectCharts, type ProjectChartAsset } from "@/contracts/figure";

export interface ExportReadiness {
  ok: boolean;
  gate: CitationGateResult;
  /** Passport 对照语言摘要（若有） */
  counterpartAbstract: { lang: "zh" | "en"; text: string } | null;
  chartAssets: ProjectChartAsset[];
}

export function assessExportReadiness(project: ProjectData): ExportReadiness {
  const texts = [
    project.abstract ?? "",
    ...Object.values(project.sections ?? {}),
  ];
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

  return {
    ok: gate.exportReady,
    gate,
    counterpartAbstract,
    chartAssets: parseProjectCharts(project.charts),
  };
}
