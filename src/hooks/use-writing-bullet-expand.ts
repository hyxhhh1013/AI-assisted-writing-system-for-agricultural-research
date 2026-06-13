"use client";

import { useCallback, useMemo, useState, useEffect, type MutableRefObject } from "react";
import { toast } from "sonner";
import {
  mergeWritingDraftParagraphs,
  normalizeWritingBullets,
  type WritingRequest,
} from "@/contracts/writing";
import type { UseWritingStreamReturn, WritingStreamResult } from "@/hooks/use-writing-stream";
import type { GenerationStatus } from "@/components/shared/writing/writing-types";
import { getErrorMessage } from "@/lib/error-utils";

interface UseWritingBulletExpandParams {
  bullets: string[];
  buildExpandRequest: (bulletIndex: number, draftSoFar: string) => WritingRequest;
  writingStream: UseWritingStreamReturn;
  resultRef: MutableRefObject<string>;
  setResult: (text: string) => void;
  setIsGenerating: (v: boolean) => void;
  setGenerationStatus: (v: GenerationStatus) => void;
  onStreamResult: (streamResult: WritingStreamResult) => void;
  onAllBulletsComplete: (mergedDraft: string) => Promise<void>;
}

export function useWritingBulletExpand(params: UseWritingBulletExpandParams) {
  const {
    bullets,
    buildExpandRequest,
    writingStream,
    resultRef,
    setResult,
    setIsGenerating,
    setGenerationStatus,
    onStreamResult,
    onAllBulletsComplete,
  } = params;

  const normalizedBullets = useMemo(() => normalizeWritingBullets(bullets), [bullets]);
  const [active, setActive] = useState(false);
  const [bulletIndex, setBulletIndex] = useState(0);
  const [adoptedDraft, setAdoptedDraft] = useState("");
  const [currentBulletText, setCurrentBulletText] = useState("");
  const [showMergePreview, setShowMergePreview] = useState(false);

  const mergePreview = useMemo(
    () => mergeWritingDraftParagraphs(adoptedDraft, currentBulletText),
    [adoptedDraft, currentBulletText],
  );

  useEffect(() => {
    if (active && writingStream.isGenerating) {
      setCurrentBulletText(writingStream.result);
    }
  }, [active, writingStream.isGenerating, writingStream.result]);

  const expandBullet = useCallback(
    async (index: number, draftSoFar: string) => {
      setIsGenerating(true);
      setGenerationStatus("writing");
      try {
        const streamResult = await writingStream.start(buildExpandRequest(index, draftSoFar), {
          replaceStream: true,
        });
        onStreamResult(streamResult);
        const text = (streamResult.bulletDone?.content ?? streamResult.content).trim();
        setCurrentBulletText(text);
        setResult(text);
        resultRef.current = text;
        return text;
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          toast.error(error instanceof Error ? getErrorMessage(error) : "要点扩写失败");
        }
        throw error;
      } finally {
        setIsGenerating(false);
        setGenerationStatus("completed");
      }
    },
    [
      buildExpandRequest,
      writingStream,
      onStreamResult,
      resultRef,
      setResult,
      setIsGenerating,
      setGenerationStatus,
    ],
  );

  const start = useCallback(async () => {
    if (normalizedBullets.length === 0) {
      toast.error("请先填写扩写要点");
      return;
    }
    setActive(true);
    setAdoptedDraft("");
    setBulletIndex(0);
    setShowMergePreview(false);
    setCurrentBulletText("");
    await expandBullet(0, "");
  }, [expandBullet, normalizedBullets.length]);

  const adoptAndNext = useCallback(async () => {
    const paragraph = currentBulletText.trim();
    if (!paragraph) {
      toast.error("当前要点尚无内容，请先扩写或填写");
      return;
    }
    const merged = mergeWritingDraftParagraphs(adoptedDraft, paragraph);
    const nextIndex = bulletIndex + 1;
    if (nextIndex >= normalizedBullets.length) {
      setActive(false);
      setAdoptedDraft(merged);
      setResult(merged);
      resultRef.current = merged;
      setCurrentBulletText("");
      await onAllBulletsComplete(merged);
      toast.success("全部要点已合并为章节草稿");
      return;
    }
    setAdoptedDraft(merged);
    setBulletIndex(nextIndex);
    setShowMergePreview(false);
    await expandBullet(nextIndex, merged);
  }, [
    adoptedDraft,
    bulletIndex,
    currentBulletText,
    expandBullet,
    normalizedBullets.length,
    onAllBulletsComplete,
    resultRef,
    setResult,
  ]);

  const rewriteCurrent = useCallback(async () => {
    await expandBullet(bulletIndex, adoptedDraft);
  }, [adoptedDraft, bulletIndex, expandBullet]);

  const reset = useCallback(() => {
    setActive(false);
    setBulletIndex(0);
    setAdoptedDraft("");
    setCurrentBulletText("");
    setShowMergePreview(false);
  }, []);

  return {
    active,
    bulletIndex,
    totalBullets: normalizedBullets.length,
    normalizedBullets,
    adoptedDraft,
    currentBulletText,
    setCurrentBulletText,
    showMergePreview,
    setShowMergePreview,
    mergePreview,
    start,
    adoptAndNext,
    rewriteCurrent,
    reset,
  };
}
