"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ChartConfig,
  DataSourceAnalysis,
  DataSourceSummary,
  EvidenceClaim,
} from "@/contracts/data-source";
import { parseDataClaims, parseDataSources, serializeDataClaims, serializeDataSources } from "@/contracts/project";
import type { ProjectData } from "@/contracts/project";
import { analyzeDataFile } from "@/services/data-source";
import { buildEvidencePack } from "@/services/evidence-pack";
import { patchProjectFields } from "@/services/project";

export interface UseEvidenceOptions {
  projectId: string;
  project: Pick<ProjectData, "dataClaims" | "dataSources" | "mode">;
  onSaved?: (patch: { dataClaims?: string; dataSources?: string }) => void;
}

export interface UseEvidenceReturn {
  claims: EvidenceClaim[];
  sources: DataSourceAnalysis[];
  summaries: DataSourceSummary[];
  injectionPreview: string;
  chartConfigs: ChartConfig[];
  isSaving: boolean;
  isAnalyzing: boolean;
  error: string | null;
  reload: () => void;
  saveClaims: (next: EvidenceClaim[]) => Promise<void>;
  addClaim: (claim: EvidenceClaim) => Promise<void>;
  updateClaim: (id: string, patch: Partial<EvidenceClaim>) => Promise<void>;
  removeClaim: (id: string) => Promise<void>;
  uploadAndAnalyze: (file: File) => Promise<void>;
}

function normalizeSourceId(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "");
  return `D-${stem.replace(/[^a-zA-Z0-9一-鿿]/g, "_").replace(/_+/g, "_")}`;
}

function buildSummaries(
  sources: DataSourceAnalysis[],
  claims: EvidenceClaim[],
): DataSourceSummary[] {
  return sources.map((source) => {
    const sourceId = normalizeSourceId(source.fileName);
    const claimCount = claims.filter((c) => c.sourceId === sourceId).length;
    return {
      sourceId,
      fileName: source.fileName,
      rowCount: source.rowCount,
      columnCount: source.columns.length,
      claimCount,
      generatedAt: source.generatedAt,
    };
  });
}

function mergeSources(
  existing: DataSourceAnalysis[],
  incoming: DataSourceAnalysis,
): DataSourceAnalysis[] {
  const idx = existing.findIndex((s) => s.fileName === incoming.fileName);
  if (idx === -1) return [...existing, incoming];
  const next = [...existing];
  next[idx] = incoming;
  return next;
}

function mergeClaimsForSource(
  existing: EvidenceClaim[],
  incoming: EvidenceClaim[],
  sourceId: string,
): EvidenceClaim[] {
  const kept = existing.filter((c) => c.sourceId !== sourceId);
  return [...kept, ...incoming];
}

export function useEvidence({
  projectId,
  project,
  onSaved,
}: UseEvidenceOptions): UseEvidenceReturn {
  const [claims, setClaims] = useState<EvidenceClaim[]>([]);
  const [sources, setSources] = useState<DataSourceAnalysis[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartConfigs, setChartConfigs] = useState<ChartConfig[]>([]);

  const reload = useCallback(() => {
    setClaims(parseDataClaims(project));
    setSources(parseDataSources(project));
    setError(null);
  }, [project.dataClaims, project.dataSources]);

  useEffect(() => {
    reload();
  }, [reload]);

  const persist = useCallback(
    async (nextClaims: EvidenceClaim[], nextSources: DataSourceAnalysis[]) => {
      setIsSaving(true);
      setError(null);
      try {
        await patchProjectFields(projectId, {
          dataClaims: nextClaims,
          dataSources: nextSources,
        });
        setClaims(nextClaims);
        setSources(nextSources);
        onSaved?.({
          dataClaims: serializeDataClaims(nextClaims),
          dataSources: serializeDataSources(nextSources),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "保存证据失败";
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [projectId, onSaved],
  );

  const saveClaims = useCallback(
    async (next: EvidenceClaim[]) => {
      await persist(next, sources);
    },
    [persist, sources],
  );

  const addClaim = useCallback(
    async (claim: EvidenceClaim) => {
      await persist([...claims, claim], sources);
    },
    [claims, persist, sources],
  );

  const updateClaim = useCallback(
    async (id: string, patch: Partial<EvidenceClaim>) => {
      const next = claims.map((c) => (c.id === id ? { ...c, ...patch } : c));
      await persist(next, sources);
    },
    [claims, persist, sources],
  );

  const removeClaim = useCallback(
    async (id: string) => {
      const next = claims.filter((c) => c.id !== id);
      await persist(next, sources);
    },
    [claims, persist, sources],
  );

  const uploadAndAnalyze = useCallback(
    async (file: File) => {
      setIsAnalyzing(true);
      setError(null);
      try {
        const result = await analyzeDataFile(file);
        const sourceId = normalizeSourceId(result.analysis.fileName);
        const nextSources = mergeSources(sources, result.analysis);
        const nextClaims = mergeClaimsForSource(claims, result.claims, sourceId);
        setChartConfigs(result.chartConfigs ?? []);
        await persist(nextClaims, nextSources);
      } catch (err) {
        const message = err instanceof Error ? err.message : "证据提取失败";
        setError(message);
        throw err;
      } finally {
        setIsAnalyzing(false);
      }
    },
    [claims, persist, sources],
  );

  const summaries = useMemo(
    () => buildSummaries(sources, claims),
    [sources, claims],
  );

  const injectionPreview = useMemo(() => {
    if (claims.length === 0) return "暂无数据证据，扩写时将不注入定量结论。";
    return buildEvidencePack({
      dataClaims: claims,
      mode: project.mode ?? "review",
    }).summary;
  }, [claims, project.mode]);

  return {
    claims,
    sources,
    summaries,
    injectionPreview,
    chartConfigs,
    isSaving,
    isAnalyzing,
    error,
    reload,
    saveClaims,
    addClaim,
    updateClaim,
    removeClaim,
    uploadAndAnalyze,
  };
}
