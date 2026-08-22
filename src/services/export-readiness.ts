"use client";

import type { ProjectData } from "@/contracts/project";
import type { CitationGateResult } from "@/contracts/citation-gate";
import type { BibOnlyPreciseDataFinding } from "@/lib/agent/precise-data-grounding";

export type ExportReadinessResponse = {
  ok: boolean;
  gate: CitationGateResult;
  warnings: string[];
  bibOnlyPrecise: BibOnlyPreciseDataFinding[];
  counterpartAbstract: { lang: "zh" | "en"; text: string } | null;
  chartAssetCount: number;
};

/**
 * 导出前就绪检查（含 bib_only 精确数据软告警）。
 * 走 `/api/export/readiness`，需登录 cookie + proxy 注入 x-user-id。
 */
export async function fetchExportReadiness(
  project: ProjectData,
): Promise<ExportReadinessResponse> {
  const response = await fetch("/api/export/readiness", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });

  const raw = await response.text().catch(() => "");
  let parsed: {
    error?: string;
    ok?: boolean;
    gate?: CitationGateResult;
    warnings?: string[];
    bibOnlyPrecise?: BibOnlyPreciseDataFinding[];
    counterpartAbstract?: ExportReadinessResponse["counterpartAbstract"];
    chartAssetCount?: number;
  } = {};
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    // not JSON
  }

  if (!response.ok) {
    throw new Error(parsed.error || raw || "导出就绪检查失败");
  }

  if (!parsed.gate || typeof parsed.ok !== "boolean") {
    throw new Error("导出就绪检查返回格式异常");
  }

  return {
    ok: parsed.ok,
    gate: parsed.gate,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    bibOnlyPrecise: Array.isArray(parsed.bibOnlyPrecise) ? parsed.bibOnlyPrecise : [],
    counterpartAbstract: parsed.counterpartAbstract ?? null,
    chartAssetCount: parsed.chartAssetCount ?? 0,
  };
}
