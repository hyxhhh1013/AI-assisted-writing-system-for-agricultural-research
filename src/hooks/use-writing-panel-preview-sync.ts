"use client";

import { useEffect, useRef } from "react";
import type { UseWritingStreamReturn } from "@/hooks/use-writing-stream";
import type { WritingPreviewPayload } from "@/components/shared/writing/writing-types";

interface UseWritingPanelPreviewSyncParams {
  isGenerating: boolean;
  targetSectionKey: string;
  subsectionTitle: string | undefined;
  onPreviewUpdate?: (data: WritingPreviewPayload) => void;
  writingStream: Pick<
    UseWritingStreamReturn,
    | "result"
    | "pipelineSteps"
    | "verificationFeedback"
    | "citationWarnings"
    | "dataClaimWarnings"
    | "detectedRefs"
  >;
}

/** 扩写过程中节流推送预览到工作台中间栏 */
export function useWritingPanelPreviewSync({
  isGenerating,
  targetSectionKey,
  subsectionTitle,
  onPreviewUpdate,
  writingStream,
}: UseWritingPanelPreviewSyncParams) {
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevGeneratingRef = useRef(isGenerating);

  useEffect(() => {
    if (!onPreviewUpdate) return;

    if (prevGeneratingRef.current && !isGenerating) {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      onPreviewUpdate({
        content: writingStream.result,
        pipelineSteps: writingStream.pipelineSteps,
        verification: writingStream.verificationFeedback,
        citationWarnings: writingStream.citationWarnings,
        dataClaimWarnings: writingStream.dataClaimWarnings,
        detectedRefs: writingStream.detectedRefs,
        targetSection: targetSectionKey,
        subsectionTitle,
        isStreaming: false,
      });
      prevGeneratingRef.current = isGenerating;
      return;
    }
    prevGeneratingRef.current = isGenerating;

    if (!isGenerating) return;
    if (previewTimerRef.current) return;
    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null;
      onPreviewUpdate({
        content: writingStream.result,
        pipelineSteps: writingStream.pipelineSteps,
        verification: writingStream.verificationFeedback,
        citationWarnings: writingStream.citationWarnings,
        dataClaimWarnings: writingStream.dataClaimWarnings,
        detectedRefs: writingStream.detectedRefs,
        targetSection: targetSectionKey,
        subsectionTitle,
      });
    }, 250);
    return () => {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
    };
  }, [
    isGenerating,
    writingStream.result,
    writingStream.pipelineSteps,
    writingStream.verificationFeedback,
    writingStream.citationWarnings,
    writingStream.dataClaimWarnings,
    writingStream.detectedRefs,
    targetSectionKey,
    subsectionTitle,
    onPreviewUpdate,
  ]);
}
