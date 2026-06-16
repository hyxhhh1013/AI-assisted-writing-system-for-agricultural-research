"use client";

import { useEffect, useRef } from "react";
import type { UseWritingStreamReturn } from "@/hooks/use-writing-stream";
import type { GenerationStatus, WritingPreviewPayload } from "@/components/shared/writing/writing-types";

interface UseWritingPanelPreviewSyncParams {
  isGenerating: boolean;
  generationStatus: GenerationStatus;
  panelResult: string;
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

function shouldDeferPreviewFinalize(panelResult: string, generationStatus: GenerationStatus): boolean {
  if (generationStatus === "generating_figures") return true;
  if (panelResult.includes("*[正在生成")) return true;
  if (/[【\[]FIG(?:URE)?:\s*\{/i.test(panelResult)) return true;
  return false;
}

/** 扩写过程中节流推送预览到工作台中间栏 */
export function useWritingPanelPreviewSync({
  isGenerating,
  generationStatus,
  panelResult,
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
      if (!shouldDeferPreviewFinalize(panelResult, generationStatus)) {
        const content = panelResult.trim() ? panelResult : writingStream.result;
        onPreviewUpdate({
          content,
          pipelineSteps: writingStream.pipelineSteps,
          verification: writingStream.verificationFeedback,
          citationWarnings: writingStream.citationWarnings,
          dataClaimWarnings: writingStream.dataClaimWarnings,
          detectedRefs: writingStream.detectedRefs,
          targetSection: targetSectionKey,
          subsectionTitle,
          isStreaming: false,
        });
      }
      prevGeneratingRef.current = isGenerating;
      return;
    }
    prevGeneratingRef.current = isGenerating;

    if (!isGenerating) return;
    if (previewTimerRef.current) return;
    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null;
      onPreviewUpdate({
        content: panelResult.trim() ? panelResult : writingStream.result,
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
    generationStatus,
    panelResult,
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
