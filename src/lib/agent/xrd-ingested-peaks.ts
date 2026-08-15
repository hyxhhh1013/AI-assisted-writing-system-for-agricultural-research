/**
 * 已入库峰表：从 dataSources.peakTable 或表格列推断。
 * generate_xrd_analysis 只吃这里的峰，禁止裸 peaksJson。
 */

import type { DataSourceAnalysis } from "@/contracts/data-source";
import type { EvidenceClaim } from "@/contracts/data-source";
import { parseDataClaims, parseDataSources, serializeDataClaims } from "@/contracts/project";
import { detectAndParse } from "@/services/data-analysis";
import type { PeakInfo } from "@/services/xrd";
import prisma from "@/lib/prisma";

const THETA_RE = /^(2[_\s-]?theta|two[_\s-]?theta|峰位|2θ)$/i;
const FWHM_RE = /^(fwhm|fwhm_deg|半高宽|半峰宽)$/i;
const INT_RE = /^(intensity|i|强度)$/i;

export const XRD_BARE_PEAKS_ERROR =
  "请上传谱/峰表附件并入库，不要手填峰位。可用 sourceAttachmentId 指向已入库峰表，或先 ingest_project_data。";

function colIndex(headers: string[], re: RegExp): number {
  return headers.findIndex((h) => re.test(h.trim()));
}

export function extractPeakTableFromParsed(
  headers: string[],
  rows: string[][],
): PeakInfo[] | null {
  const ti = colIndex(headers, THETA_RE);
  if (ti < 0) return null;
  const fi = colIndex(headers, FWHM_RE);
  const ii = colIndex(headers, INT_RE);
  const peaks: PeakInfo[] = [];
  for (const row of rows) {
    const two_theta = Number(row[ti]);
    if (!Number.isFinite(two_theta)) continue;
    const fwhm = fi >= 0 ? Number(row[fi]) : undefined;
    const intensity = ii >= 0 ? Number(row[ii]) : 0;
    peaks.push({
      two_theta,
      intensity: Number.isFinite(intensity) ? intensity : 0,
      relative_intensity: 100,
      fwhm: fwhm != null && Number.isFinite(fwhm) && fwhm > 0 ? fwhm : undefined,
    });
  }
  return peaks.length > 0 ? peaks : null;
}

export async function enrichAnalysisWithPeakTable(
  analysis: DataSourceAnalysis,
  input: string | ArrayBuffer,
  fileName: string,
): Promise<DataSourceAnalysis> {
  if (analysis.peakTable && analysis.peakTable.length > 0) return analysis;
  try {
    const { headers, rows } = await detectAndParse(input, fileName);
    const peakTable = extractPeakTableFromParsed(headers, rows);
    if (!peakTable) return analysis;
    return {
      ...analysis,
      peakTable: peakTable.map((p) => ({
        two_theta: p.two_theta,
        intensity: p.intensity,
        relative_intensity: p.relative_intensity,
        ...(p.fwhm != null ? { fwhm: p.fwhm } : {}),
      })),
    };
  } catch {
    return analysis;
  }
}

export function findIngestedPeakTable(
  sources: DataSourceAnalysis[],
  fileName?: string,
): { source: DataSourceAnalysis; peaks: PeakInfo[] } | null {
  const list = fileName
    ? sources.filter((s) => s.fileName === fileName)
    : sources;
  for (const source of list) {
    if (source.peakTable && source.peakTable.length > 0) {
      return {
        source,
        peaks: source.peakTable.map((p) => ({
          two_theta: p.two_theta,
          intensity: p.intensity ?? 0,
          relative_intensity: p.relative_intensity ?? 100,
          fwhm: p.fwhm,
        })),
      };
    }
  }
  return null;
}

export function peaksMatchIngested(
  proposed: PeakInfo[],
  ingested: PeakInfo[],
  tol = 0.05,
): boolean {
  if (proposed.length === 0 || ingested.length === 0) return false;
  return proposed.every((p) =>
    ingested.some((q) => Math.abs(q.two_theta - p.two_theta) <= tol),
  );
}

export async function loadIngestedPeakTable(opts: {
  userId: string;
  projectId: string;
  fileName?: string;
}): Promise<{ source: DataSourceAnalysis; peaks: PeakInfo[] } | null> {
  const row = await prisma.project.findFirst({
    where: { id: opts.projectId, userId: opts.userId },
    select: { dataSources: true },
  });
  if (!row) return null;
  const sources = parseDataSources({ dataSources: row.dataSources ?? undefined });
  return findIngestedPeakTable(sources, opts.fileName);
}

export async function appendXrdResultClaims(opts: {
  userId: string;
  projectId: string;
  claims: EvidenceClaim[];
}): Promise<void> {
  if (opts.claims.length === 0) return;
  const row = await prisma.project.findFirst({
    where: { id: opts.projectId, userId: opts.userId },
    select: { dataClaims: true },
  });
  if (!row) return;
  const existing = parseDataClaims({ dataClaims: row.dataClaims ?? undefined });
  const replaceIds = new Set(opts.claims.map((c) => c.id));
  const next = [...existing.filter((c) => !replaceIds.has(c.id)), ...opts.claims];
  await prisma.project.update({
    where: { id: opts.projectId },
    data: { dataClaims: serializeDataClaims(next), lastUpdated: new Date() },
  });
}
