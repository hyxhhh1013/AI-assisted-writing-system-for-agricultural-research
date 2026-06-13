"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { RetrievePreviewHit } from "@/contracts/writing-retrieve-preview";
import { resolveWritingDraftContext } from "@/contracts/writing";
import { postWritingRetrievePreview } from "@/services/writing-retrieve-preview";
import { getErrorMessage } from "@/lib/error-utils";

export interface WritingSourceSelectionParams {
  title: string;
  section: string;
  context: string;
  bullets: string[];
  language: string;
  retrievalMode: "precise" | "balanced" | "extensive";
  existingReferences: string[];
  researchDirection?: string;
  projectMode: "review" | "research";
  draftReady: boolean;
}

/** 检索范围变更（不含要点/补充说明，避免输入时清空预览） */
function buildQueryKey(params: {
  title: string;
  section: string;
  language: string;
  retrievalMode: string;
  researchDirection?: string;
  projectMode: string;
}): string {
  return [
    params.title,
    params.section,
    params.language,
    params.retrievalMode,
    params.researchDirection || "",
    params.projectMode,
  ].join("\0");
}

export function useWritingSourceSelection(params: WritingSourceSelectionParams) {
  const {
    title,
    section,
    context,
    bullets,
    language,
    retrievalMode,
    existingReferences,
    researchDirection,
    projectMode,
    draftReady,
  } = params;

  const [hits, setHits] = useState<RetrievePreviewHit[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [previewQuery, setPreviewQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [fetchedOnce, setFetchedOnce] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [previewStale, setPreviewStale] = useState(false);

  const queryKey = useMemo(
    () =>
      buildQueryKey({
        title,
        section,
        language,
        retrievalMode,
        researchDirection,
        projectMode,
      }),
    [title, section, language, retrievalMode, researchDirection, projectMode],
  );

  const draftFingerprint = useMemo(
    () => resolveWritingDraftContext(context, bullets),
    [context, bullets],
  );

  const lastFetchedDraftRef = useRef("");

  useEffect(() => {
    setHits([]);
    setSelectedSourceIds([]);
    setPreviewQuery("");
    setConfirmed(false);
    setFetchedOnce(false);
    setFetchError(null);
    setPreviewStale(false);
    lastFetchedDraftRef.current = "";
  }, [queryKey]);

  useEffect(() => {
    if (!fetchedOnce) return;
    if (draftFingerprint !== lastFetchedDraftRef.current) {
      setPreviewStale(true);
      setConfirmed(false);
    }
  }, [draftFingerprint, fetchedOnce]);

  const fetchPreview = useCallback(async () => {
    if (!draftReady) {
      toast.error("请先写出足够的写作思路再检索文献");
      return;
    }
    setLoading(true);
    setFetchError(null);
    try {
      const preview = await postWritingRetrievePreview({
        title,
        section,
        context,
        bullets,
        language: language as "zh" | "en",
        existingReferences,
        researchDirection,
        retrievalMode,
        projectMode,
      });
      setHits(preview.hits);
      setSelectedSourceIds(preview.defaultSelectedSourceIds);
      setPreviewQuery(preview.query);
      setFetchedOnce(true);
      setPreviewStale(false);
      lastFetchedDraftRef.current = draftFingerprint;
      setConfirmed(preview.hitCount === 0);
      if (preview.hitCount === 0) {
        toast.info("未检索到相关文献，将按通用知识扩写");
      } else {
        toast.success(`找到 ${preview.hitCount} 篇相关文献，请勾选后确认`);
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setFetchError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [
    draftReady,
    draftFingerprint,
    title,
    section,
    context,
    bullets,
    language,
    existingReferences,
    researchDirection,
    retrievalMode,
    projectMode,
  ]);

  const toggleSource = useCallback((sourceKey: string, checked: boolean) => {
    setConfirmed(false);
    setSelectedSourceIds((prev) => {
      if (checked) return prev.includes(sourceKey) ? prev : [...prev, sourceKey];
      return prev.filter((id) => id !== sourceKey);
    });
  }, []);

  const selectAll = useCallback(() => {
    setConfirmed(false);
    setSelectedSourceIds(hits.map((h) => h.sourceKey));
  }, [hits]);

  const deselectAll = useCallback(() => {
    setConfirmed(false);
    setSelectedSourceIds([]);
  }, []);

  const confirmSelection = useCallback(() => {
    if (!fetchedOnce) {
      toast.error("请先检索文献");
      return false;
    }
    if (previewStale) {
      toast.error("要点已变更，请重新检索文献后再确认");
      return false;
    }
    if (hits.length > 0 && selectedSourceIds.length === 0) {
      toast.error("请至少勾选一篇文献，或确认无文献扩写");
      return false;
    }
    setConfirmed(true);
    toast.success(
      hits.length === 0
        ? "已确认：本次扩写不使用 RAG 文献"
        : `已确认 ${selectedSourceIds.length} 篇文献参与扩写`,
    );
    return true;
  }, [fetchedOnce, previewStale, hits.length, selectedSourceIds.length]);

  const resetSelection = useCallback(() => {
    setHits([]);
    setSelectedSourceIds([]);
    setPreviewQuery("");
    setConfirmed(false);
    setFetchedOnce(false);
    setFetchError(null);
    setPreviewStale(false);
    lastFetchedDraftRef.current = "";
  }, []);

  const needsConfirmation = hits.length > 0 || fetchedOnce;
  const canGenerate = !needsConfirmation || (confirmed && !previewStale);

  return {
    hits,
    selectedSourceIds,
    previewQuery,
    loading,
    confirmed,
    fetchedOnce,
    fetchError,
    previewStale,
    canGenerate,
    fetchPreview,
    toggleSource,
    selectAll,
    deselectAll,
    confirmSelection,
    resetSelection,
  };
}
