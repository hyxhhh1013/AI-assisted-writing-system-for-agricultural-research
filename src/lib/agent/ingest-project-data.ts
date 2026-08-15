/**
 * Agent 表格入库：与数据面板同一份 dataSources + dataClaims。
 * 合并规则对齐 use-evidence（同 fileName 覆盖源，按 sourceId 替换声明）。
 */

import type { DataSourceAnalysis, EvidenceClaim } from "@/contracts/data-source";
import {
  parseDataClaims,
  parseDataSources,
  serializeDataClaims,
  serializeDataSources,
} from "@/contracts/project";
import { assessDataFoundation, type DataFoundation } from "@/lib/agent/data-foundation";
import prisma from "@/lib/prisma";

/** 与 use-evidence.normalizeSourceId 一致 */
export function normalizeIngestSourceId(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "");
  return `D-${stem.replace(/[^a-zA-Z0-9一-鿿]/g, "_").replace(/_+/g, "_")}`;
}

export function mergeIngestedSources(
  existing: DataSourceAnalysis[],
  incoming: DataSourceAnalysis,
): { sources: DataSourceAnalysis[]; replaced: boolean } {
  const idx = existing.findIndex((s) => s.fileName === incoming.fileName);
  if (idx === -1) {
    return { sources: [...existing, incoming], replaced: false };
  }
  const next = [...existing];
  next[idx] = incoming;
  return { sources: next, replaced: true };
}

/**
 * 按 sourceId 替换声明。同时丢掉 incoming 自带的 sourceId
 *（analyzeFile 的 makeSourceId 与 normalize 略有差异），保证重入库幂等。
 */
export function mergeIngestedClaims(
  existing: EvidenceClaim[],
  incoming: EvidenceClaim[],
  sourceId: string,
): EvidenceClaim[] {
  const drop = new Set<string>([
    sourceId,
    ...incoming.map((c) => c.sourceId).filter(Boolean),
  ]);
  const kept = existing.filter((c) => !drop.has(c.sourceId));
  return [...kept, ...incoming];
}

export function countChartCandidates(sources: DataSourceAnalysis[]): number {
  return sources.reduce((n, s) => n + (s.chartConfigs?.length ?? 0), 0);
}

export interface PersistIngestedAnalysisInput {
  userId: string;
  projectId: string;
  analysis: DataSourceAnalysis;
  claims: EvidenceClaim[];
}

export interface PersistIngestedAnalysisResult {
  sources: DataSourceAnalysis[];
  claims: EvidenceClaim[];
  sourceId: string;
  replaced: boolean;
  foundation: DataFoundation;
}

export async function persistIngestedAnalysis(
  input: PersistIngestedAnalysisInput,
): Promise<PersistIngestedAnalysisResult> {
  const owned = await prisma.project.findFirst({
    where: { id: input.projectId, userId: input.userId },
    select: { id: true, dataSources: true, dataClaims: true },
  });
  if (!owned) {
    throw new Error("项目不存在或无权访问");
  }

  const existingSources = parseDataSources({
    dataSources: owned.dataSources ?? undefined,
  });
  const existingClaims = parseDataClaims({
    dataClaims: owned.dataClaims ?? undefined,
  });
  const sourceId = normalizeIngestSourceId(input.analysis.fileName);
  const { sources, replaced } = mergeIngestedSources(existingSources, input.analysis);
  const claims = mergeIngestedClaims(existingClaims, input.claims, sourceId);

  await prisma.project.update({
    where: { id: input.projectId },
    data: {
      dataSources: serializeDataSources(sources),
      dataClaims: serializeDataClaims(claims),
      lastUpdated: new Date(),
    },
  });

  return {
    sources,
    claims,
    sourceId,
    replaced,
    foundation: assessDataFoundation({
      claimCount: claims.length,
      sourceCount: sources.length,
      candidateCount: countChartCandidates(sources),
    }),
  };
}
