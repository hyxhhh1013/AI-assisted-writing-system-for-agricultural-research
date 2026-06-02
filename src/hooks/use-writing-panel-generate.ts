"use client";

import { useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import type { ProjectData } from "@/contracts/project";
import type { OutlineTask } from "@/lib/utils";
import { countProjectFigures, getOutlineTaskIdsForSectionCompletion } from "@/lib/utils";
import { findFigureBlocks, replacePlaceholders } from "@/hooks/use-figure-pipeline";
import { generateFigure } from "@/services/figures";
import type { UseWritingStreamReturn } from "@/hooks/use-writing-stream";
import { batchUpsertReferences } from "@/services/references";
import type { WritingPreviewPayload } from "@/components/shared/writing/writing-types";
import type { GenerationStatus } from "@/components/shared/writing/writing-types";
import { createLogger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";

const log = createLogger("writing-panel");

interface UseWritingPanelGenerateParams {
  projectId: string;
  project: ProjectData;
  title: string;
  context: string;
  targetSectionKey: string;
  selectedSectionId: string;
  language: string;
  retrievalMode: "precise" | "balanced" | "extensive";
  fastMode: boolean;
  outlineTasks: OutlineTask[];
  writingStream: UseWritingStreamReturn;
  onUpdateProject?: (updates: Partial<ProjectData>) => void;
  onPreviewUpdate?: (data: WritingPreviewPayload) => void;
  onTaskExpanded?: (taskIds: string | string[]) => void;
  setIsGenerating: (v: boolean) => void;
  setGenerationStatus: (v: GenerationStatus) => void;
  setResult: (v: string) => void;
  setVerificationFeedback: (v: string) => void;
  setDetectedRefs: (v: string[]) => void;
  setCitationWarnings: (v: WritingPreviewPayload["citationWarnings"]) => void;
  setDataClaimWarnings: (v: WritingPreviewPayload["dataClaimWarnings"]) => void;
  setLastRefMapping: (v: Record<string, number> | null) => void;
  setSubsectionTitle: (v: string | undefined) => void;
  setPendingFigures: Dispatch<
    SetStateAction<
      { spec: string; tool: string; config: string; caption: string; status: string; imageUrl?: string }[]
    >
  >;
  applyToEditor: (content: string, section: string, subsection?: string) => void;
}

export function useWritingPanelGenerate(params: UseWritingPanelGenerateParams) {
  const resultRef = useRef("");
  const figureCountRef = useRef(0);
  const detectedFiguresRef = useRef<{ tool: string; config: string; caption: string }[]>([]);
  const figureAbortRef = useRef<AbortController | null>(null);
  const writingAbortRef = useRef<AbortController | null>(null);

  const {
    projectId,
    project,
    title,
    context,
    targetSectionKey,
    selectedSectionId,
    language,
    retrievalMode,
    fastMode,
    outlineTasks,
    writingStream,
    onUpdateProject,
    onPreviewUpdate,
    onTaskExpanded,
    setIsGenerating,
    setGenerationStatus,
    setResult,
    setVerificationFeedback,
    setDetectedRefs,
    setCitationWarnings,
    setDataClaimWarnings,
    setLastRefMapping,
    setSubsectionTitle,
    setPendingFigures,
    applyToEditor,
  } = params;

  const handleCancel = useCallback(() => {
    writingStream.cancel();
    figureAbortRef.current?.abort();
    setIsGenerating(false);
    setGenerationStatus("idle");
  }, [writingStream, setIsGenerating, setGenerationStatus]);

  const handleGenerate = useCallback(async () => {
    if (!title || !context) {
      toast.error("请填写完整信息");
      return;
    }

    setIsGenerating(true);
    setGenerationStatus("writing");
    setResult("");
    setVerificationFeedback("");
    setDetectedRefs([]);
    setCitationWarnings([]);
    setDataClaimWarnings([]);

    try {
      const sectionPreviews: Record<string, string> = {};
      Object.entries(project.sections).forEach(([key, content]) => {
        if (content && key !== targetSectionKey) {
          sectionPreviews[key] = content.slice(0, 150) + "...";
        }
      });

      const selectedTask = outlineTasks.find((t) => t.id === selectedSectionId);
      const subTitle = selectedTask && selectedTask.level > 1 ? selectedTask.title : undefined;
      const isChapterScope = !selectedTask || selectedTask.level <= 1;
      setSubsectionTitle(subTitle);

      const existingFigures = countProjectFigures(project, targetSectionKey);

      const dataClaims = (() => {
        try {
          return project.dataClaims ? JSON.parse(project.dataClaims) : [];
        } catch {
          return [];
        }
      })();

      const streamResult = await writingStream.start({
        title,
        section: targetSectionKey,
        context,
        language: language as "zh" | "en",
        template: project.template,
        existingReferences: project.references || [],
        researchDirection: project.researchDirection,
        retrievalMode,
        mode: fastMode ? "fast" : "full",
        subsectionTitle: subTitle,
        figureStart: existingFigures + 1,
        projectMode: project.mode || "review",
        citationStyle: project.citationStyle || "gbt7714",
        dataClaims,
        globalContext: {
          abstract: project.abstract,
          outline: project.outline,
          sectionPreviews,
          analysisResults: project.analysisResults || [],
        },
      });

      setResult(streamResult.content);
      resultRef.current = streamResult.content;
      setVerificationFeedback(streamResult.verification);
      setDetectedRefs(streamResult.references);
      setCitationWarnings(streamResult.citationWarnings);
      setDataClaimWarnings(streamResult.dataClaimWarnings);
      if (streamResult.references.length > 0 && onUpdateProject) {
        onUpdateProject({ references: streamResult.references });
      }

      if (streamResult.refMapping && Object.keys(streamResult.refMapping).length > 0) {
        setLastRefMapping(streamResult.refMapping);
        const mappings = Object.entries(streamResult.refMapping).map(([sourceName, refIndex]) => ({
          refIndex,
          sourceName,
          category: "",
          citation: "",
        }));
        batchUpsertReferences({ projectId, mappings }).catch(() => {});
      }

      const fullText = resultRef.current;
      const { processedText: phText, count: placeholderCount } = replacePlaceholders(fullText);
      if (placeholderCount > 0) {
        setResult(phText);
        resultRef.current = phText;
      }

      const figureBlocks = findFigureBlocks(placeholderCount > 0 ? phText : fullText);
      const detectedFigures: { tool: string; config: string; caption: string }[] = [];
      let processedText = placeholderCount > 0 ? phText : fullText;
      for (const block of figureBlocks) {
        const json = block.json;
        const tool = json.tool as string | undefined;
        const config = json.config as Record<string, unknown> | undefined;
        const caption = json.caption as string | undefined;
        if (!tool || !config || !caption) continue;
        detectedFigures.push({ tool, config: JSON.stringify(config), caption });
        processedText = processedText.replace(block.raw, `\n\n*[正在生成 ${caption}...]*\n\n`);
        figureCountRef.current++;
      }

      const rawFigureCount = (processedText.match(/[【\[]FIG(?:URE)?:\{/gi) || []).length;
      if (rawFigureCount > 0) {
        toast.warning(`发现 ${rawFigureCount} 个图表标记格式异常，已保留原文标记，请手动处理`);
      }

      if (detectedFigures.length > 0) {
        setResult(processedText);
        resultRef.current = processedText;
        detectedFiguresRef.current = detectedFigures;
        setPendingFigures(detectedFigures.map((f) => ({ ...f, spec: "", status: "pending" as const })));

        setGenerationStatus("generating_figures");
        toast.info(`正在自动生成 ${detectedFigures.length} 张配图...`);
        const _abort = new AbortController();
        figureAbortRef.current = _abort;
        (async () => {
          const _figs = detectedFiguresRef.current;
          for (let i = 0; i < _figs.length; i++) {
            if (_abort.signal.aborted) break;
            setPendingFigures((prev) =>
              prev.map((f, j) => (j === i ? { ...f, status: "generating" } : f)),
            );
            const fig = _figs[i];
            if (!fig) continue;
            try {
              const cfg = JSON.parse(fig.config);
              const genResult = await generateFigure(fig.tool, cfg, fig.caption, _abort.signal);
              const tag = `*[正在生成 ${fig.caption}...]*`;
              if (genResult.url) {
                const md = `\n\n![${fig.caption}](${genResult.url})\n\n`;
                resultRef.current = resultRef.current.replace(tag, md);
                setResult(resultRef.current);
                setPendingFigures((prev) =>
                  prev.map((f, j) => (j === i ? { ...f, status: "done", imageUrl: genResult.url } : f)),
                );
              } else {
                const reason = genResult.error || "生成失败";
                const fallback = `\n\n> 📊 **${fig.caption}**（${reason}，请手动补充）\n\n`;
                resultRef.current = resultRef.current.replace(tag, fallback);
                setResult(resultRef.current);
                setPendingFigures((prev) =>
                  prev.map((f, j) => (j === i ? { ...f, status: "failed" } : f)),
                );
              }
            } catch (e) {
              log.fail("figure generation failed", e, { caption: fig.caption });
              const tag = `*[正在生成 ${fig.caption}...]*`;
              const fallback = `\n\n> 📊 **${fig.caption}**（生成异常，请手动补充）\n\n`;
              resultRef.current = resultRef.current.replace(tag, fallback);
              setResult(resultRef.current);
              setPendingFigures((prev) =>
                prev.map((f, j) => (j === i ? { ...f, status: "failed" } : f)),
              );
            }
          }
          toast.success("配图生成完成");
          setGenerationStatus("completed");
          if (onPreviewUpdate) {
            onPreviewUpdate({
              content: resultRef.current,
              pipelineSteps: writingStream.pipelineSteps,
              verification: writingStream.verificationFeedback,
              citationWarnings: writingStream.citationWarnings,
              dataClaimWarnings: writingStream.dataClaimWarnings,
              detectedRefs: writingStream.detectedRefs,
              targetSection: targetSectionKey,
              subsectionTitle: subTitle,
              isStreaming: false,
            });
          }
          applyToEditor(resultRef.current, targetSectionKey, subTitle);
        })();
      } else {
        setGenerationStatus("completed");
      }
      const completedIds = isChapterScope
        ? getOutlineTaskIdsForSectionCompletion(outlineTasks, targetSectionKey, selectedSectionId)
        : selectedSectionId
          ? [selectedSectionId]
          : [];
      if (completedIds.length > 0 && onTaskExpanded) {
        onTaskExpanded(completedIds);
      }
    } catch (error: unknown) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast.error(error instanceof Error ? getErrorMessage(error) : "写作生成失败");
      }
      setGenerationStatus("idle");
    } finally {
      setIsGenerating(false);
    }
  }, [
    title,
    context,
    targetSectionKey,
    selectedSectionId,
    language,
    retrievalMode,
    fastMode,
    outlineTasks,
    project,
    projectId,
    writingStream,
    onUpdateProject,
    onPreviewUpdate,
    onTaskExpanded,
    setIsGenerating,
    setGenerationStatus,
    setResult,
    setVerificationFeedback,
    setDetectedRefs,
    setCitationWarnings,
    setDataClaimWarnings,
    setLastRefMapping,
    setSubsectionTitle,
    setPendingFigures,
    applyToEditor,
  ]);

  return {
    resultRef,
    figureAbortRef,
    writingAbortRef,
    handleCancel,
    handleGenerate,
  };
}
