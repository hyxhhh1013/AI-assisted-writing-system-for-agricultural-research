"use client";

import { useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import type { ProjectData } from "@/contracts/project";
import { parseWritingBlueprint } from "@/contracts/writing-blueprint";
import type { OutlineTask } from "@/lib/utils";
import { countProjectFigures, getOutlineTaskIdsForSectionCompletion } from "@/lib/utils";
import { findFigureBlocks, replacePlaceholders } from "@/hooks/use-figure-pipeline";
import { generateFigure } from "@/services/figures";
import type { UseWritingStreamReturn } from "@/hooks/use-writing-stream";
import { batchUpsertReferences } from "@/services/references";
import type { WritingPreviewPayload } from "@/components/shared/writing/writing-types";
import type { GenerationStatus } from "@/components/shared/writing/writing-types";
import { buildPreviewReferencesFromContent } from "@/lib/reference-reorder";
import { getMinDraftChars, isWritingDraftReady, normalizeWritingBullets, shouldUseCollaborativeBulletExpand, toApiWriteMode, type ManualWritingPhase, type WritingFlowMode, type WritingRequest } from "@/contracts/writing";
import type { WritingStreamResult } from "@/hooks/use-writing-stream";
import { useWritingBulletExpand } from "@/hooks/use-writing-bullet-expand";
import { createLogger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";

const log = createLogger("writing-panel");

interface UseWritingPanelGenerateParams {
  projectId: string;
  project: ProjectData;
  title: string;
  context: string;
  bullets: string[];
  targetSectionKey: string;
  selectedSectionId: string;
  language: string;
  retrievalMode: "precise" | "balanced" | "extensive";
  flowMode: WritingFlowMode;
  setManualPhase: (phase: ManualWritingPhase) => void;
  verificationFeedback: string;
  selectedSourceIds: string[] | undefined;
  outlineTasks: OutlineTask[];
  writingStream: UseWritingStreamReturn;
  onUpdateProject?: (updates: Partial<ProjectData>) => void;
  onPreviewUpdate?: (data: WritingPreviewPayload) => void;
  onTaskExpanded?: (taskIds: string | string[]) => void;
  setIsGenerating: (v: boolean) => void;
  setGenerationStatus: (v: GenerationStatus) => void;
  setResult: (v: string) => void;
  setVerificationFeedback: (v: string) => void;
  setDetectedRefs: Dispatch<SetStateAction<string[]>>;
  setCitationWarnings: (v: WritingPreviewPayload["citationWarnings"]) => void;
  setDataClaimWarnings: (v: WritingPreviewPayload["dataClaimWarnings"]) => void;
  setLastRefMapping: (v: Record<string, number> | null) => void;
  setSubsectionTitle: (v: string | undefined) => void;
  setPendingFigures: Dispatch<
    SetStateAction<
      { spec: string; tool: string; config: string; caption: string; status: string; imageUrl?: string }[]
    >
  >;
  lastRefMapping: Record<string, number> | null;
  applyToEditor: (content: string, section: string, subsection?: string) => void;
  onDraftApplied?: (section: string, subsection?: string) => void;
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
    bullets,
    targetSectionKey,
    selectedSectionId,
    language,
    retrievalMode,
    flowMode,
    setManualPhase,
    verificationFeedback,
    selectedSourceIds,
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
    lastRefMapping,
    applyToEditor,
    onDraftApplied,
  } = params;

  const handleCancel = useCallback(() => {
    writingStream.cancel();
    figureAbortRef.current?.abort();
    setIsGenerating(false);
    setGenerationStatus("idle");
  }, [writingStream, setIsGenerating, setGenerationStatus]);

  const buildWritingRequest = useCallback(
    (draftContext: string, mode: WritingRequest["mode"], subTitle?: string): WritingRequest => {
      const sectionPreviews: Record<string, string> = {};
      Object.entries(project.sections).forEach(([key, content]) => {
        if (content && key !== targetSectionKey) {
          sectionPreviews[key] = content.slice(0, 150) + "...";
        }
      });

      const existingFigures = countProjectFigures(project, targetSectionKey);
      const dataClaims = (() => {
        try {
          return project.dataClaims ? JSON.parse(project.dataClaims) : [];
        } catch {
          return [];
        }
      })();

      return {
        title,
        section: targetSectionKey,
        context: draftContext,
        bullets: normalizeWritingBullets(bullets),
        language: language as "zh" | "en",
        template: project.template,
        existingReferences: project.references || [],
        researchDirection: project.researchDirection,
        retrievalMode,
        mode,
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
          blueprint: parseWritingBlueprint(project.writingBlueprint),
        },
        ...(selectedSourceIds !== undefined ? { selectedSourceIds } : {}),
      };
    },
    [project, targetSectionKey, title, language, retrievalMode, selectedSourceIds, bullets],
  );

  const applyGenerationResult = useCallback(
    async (fullText: string, subTitle: string | undefined, isChapterScope: boolean) => {
      figureCountRef.current = 0;

      const citedRefs = buildPreviewReferencesFromContent(
        fullText,
        project.references || [],
        writingStream.detectedRefs,
        lastRefMapping,
      );
      if (citedRefs.length > 0) {
        setDetectedRefs(citedRefs);
        if (onUpdateProject) {
          onUpdateProject({ references: citedRefs });
        }
      }

      setResult(fullText);
      resultRef.current = fullText;

      const { processedText: phText, count: placeholderCount } = replacePlaceholders(fullText);
      if (placeholderCount > 0) {
        setResult(phText);
        resultRef.current = phText;
      }

      const figureSource = placeholderCount > 0 ? phText : fullText;
      const figureBlocks = findFigureBlocks(figureSource);
      const detectedFigures: { tool: string; config: string; caption: string }[] = [];
      let processedText = figureSource;
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

      const rawFigureCount = (processedText.match(/[【\[]FIG(?:URE)?:\s*\{/gi) || []).length;
      if (rawFigureCount > 0) {
        toast.warning(`发现 ${rawFigureCount} 个图表标记格式异常，已保留原文标记，请手动处理`);
      }

      const pushPreview = (content: string) => {
        if (!onPreviewUpdate) return;
        onPreviewUpdate({
          content,
          pipelineSteps: writingStream.pipelineSteps,
          verification: writingStream.verificationFeedback,
          citationWarnings: writingStream.citationWarnings,
          dataClaimWarnings: writingStream.dataClaimWarnings,
          detectedRefs: citedRefs.length > 0 ? citedRefs : writingStream.detectedRefs,
          targetSection: targetSectionKey,
          subsectionTitle: subTitle,
          isStreaming: false,
        });
      };

      const finishGeneration = (content: string) => {
        setGenerationStatus("completed");
        if (flowMode === "standard") {
          setManualPhase("draft_ready");
        } else {
          setManualPhase("done");
        }
        pushPreview(content);
        applyToEditor(content, targetSectionKey, subTitle);
        onDraftApplied?.(targetSectionKey, subTitle);
      };

      if (detectedFigures.length > 0) {
        setResult(processedText);
        resultRef.current = processedText;
        detectedFiguresRef.current = detectedFigures;
        setPendingFigures(detectedFigures.map((f) => ({ ...f, spec: "", status: "pending" as const })));

        setIsGenerating(true);
        setGenerationStatus("generating_figures");
        toast.info(`正在自动生成 ${detectedFigures.length} 张配图...`);
        const _abort = new AbortController();
        figureAbortRef.current = _abort;

        try {
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
          if (!_abort.signal.aborted) {
            toast.success("配图生成完成");
          }
          finishGeneration(resultRef.current);
        } finally {
          setIsGenerating(false);
        }
      } else {
        finishGeneration(figureSource);
      }

      const completedIds = isChapterScope
        ? getOutlineTaskIdsForSectionCompletion(outlineTasks, targetSectionKey, selectedSectionId)
        : selectedSectionId
          ? [selectedSectionId]
          : [];
      if (completedIds.length > 0 && onTaskExpanded) {
        onTaskExpanded(completedIds);
      }
    },
    [
      flowMode,
      onPreviewUpdate,
      onTaskExpanded,
      outlineTasks,
      selectedSectionId,
      targetSectionKey,
      writingStream,
      project.references,
      lastRefMapping,
      onUpdateProject,
      applyToEditor,
      onDraftApplied,
      setGenerationStatus,
      setManualPhase,
      setPendingFigures,
      setResult,
      setDetectedRefs,
      setIsGenerating,
    ],
  );

  const handleBulletStreamResult = useCallback(
    (streamResult: WritingStreamResult) => {
      if (streamResult.references.length > 0) {
        setDetectedRefs((prev) => Array.from(new Set([...prev, ...streamResult.references])));
      }
      setCitationWarnings(streamResult.citationWarnings);
      setDataClaimWarnings(streamResult.dataClaimWarnings);
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
    },
    [projectId, setCitationWarnings, setDataClaimWarnings, setDetectedRefs, setLastRefMapping],
  );

  const buildExpandRequest = useCallback(
    (bulletIndex: number, draftSoFar: string): WritingRequest => {
      const selectedTask = outlineTasks.find((t) => t.id === selectedSectionId);
      const subTitle = selectedTask && selectedTask.level > 1 ? selectedTask.title : undefined;
      return {
        ...buildWritingRequest(context, "expand_bullet", subTitle),
        bulletIndex,
        draftSoFar,
      };
    },
    [buildWritingRequest, context, outlineTasks, selectedSectionId],
  );

  const bulletExpand = useWritingBulletExpand({
    bullets,
    buildExpandRequest,
    writingStream,
    resultRef,
    setResult,
    setIsGenerating,
    setGenerationStatus,
    onStreamResult: handleBulletStreamResult,
    onAllBulletsComplete: async (mergedDraft) => {
      const selectedTask = outlineTasks.find((t) => t.id === selectedSectionId);
      const subTitle = selectedTask && selectedTask.level > 1 ? selectedTask.title : undefined;
      const isChapterScope = !selectedTask || selectedTask.level <= 1;
      await applyGenerationResult(mergedDraft, subTitle, isChapterScope);
    },
  });

  const syncDraft = useCallback(
    (text: string) => {
      resultRef.current = text;
      setResult(text);
    },
    [setResult],
  );

  const handleGenerate = useCallback(async () => {
    if (!title) {
      toast.error("请填写完整信息");
      return;
    }

    if (!isWritingDraftReady(context, bullets, targetSectionKey)) {
      const minDraft = getMinDraftChars(targetSectionKey);
      toast.error(`请先填写 ${minDraft} 字以上的扩写要点（每条至少 8 字）`);
      return;
    }

    const selectedTask = outlineTasks.find((t) => t.id === selectedSectionId);
    const subTitle = selectedTask && selectedTask.level > 1 ? selectedTask.title : undefined;
    const isChapterScope = !selectedTask || selectedTask.level <= 1;
    setSubsectionTitle(subTitle);

    const useCollaborative = shouldUseCollaborativeBulletExpand(flowMode, bullets);

    setIsGenerating(true);
    setManualPhase("idle");
    if (!useCollaborative) {
      setResult("");
      setVerificationFeedback("");
      setDetectedRefs([]);
      setCitationWarnings([]);
      setDataClaimWarnings([]);
    }

    try {
      if (useCollaborative) {
        setGenerationStatus("writing");
        await bulletExpand.start();
        return;
      }

      setGenerationStatus("writing");
      setVerificationFeedback("");
      setDetectedRefs([]);
      setCitationWarnings([]);
      setDataClaimWarnings([]);

      const streamResult = await writingStream.start(
        buildWritingRequest(context, toApiWriteMode(flowMode), subTitle),
      );

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

      await applyGenerationResult(streamResult.content, subTitle, isChapterScope);
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
    bullets,
    targetSectionKey,
    selectedSectionId,
    language,
    retrievalMode,
    flowMode,
    buildWritingRequest,
    outlineTasks,
    project,
    projectId,
    writingStream,
    onUpdateProject,
    bulletExpand,
    applyGenerationResult,
    setIsGenerating,
    setGenerationStatus,
    setResult,
    setVerificationFeedback,
    setDetectedRefs,
    setCitationWarnings,
    setDataClaimWarnings,
    setLastRefMapping,
    setSubsectionTitle,
    setManualPhase,
  ]);

  const handleSubmitAudit = useCallback(async () => {
    const draft = (resultRef.current || "").trim();
    if (!draft) {
      toast.error("请先生成或填写初稿内容");
      return;
    }
    if (!title) {
      toast.error("请填写论文题目");
      return;
    }

    setIsGenerating(true);
    setGenerationStatus("verifying");
    setVerificationFeedback("");

    try {
      const selectedTask = outlineTasks.find((t) => t.id === selectedSectionId);
      const subTitle = selectedTask && selectedTask.level > 1 ? selectedTask.title : undefined;

      resultRef.current = draft;
      setResult(draft);

      const streamResult = await writingStream.start(
        buildWritingRequest(draft, "audit_only", subTitle),
        { keepDraft: true },
      );

      setVerificationFeedback(streamResult.verification);
      setManualPhase("review_ready");
      setGenerationStatus("completed");

      if (onPreviewUpdate) {
        onPreviewUpdate({
          content: draft,
          pipelineSteps: writingStream.pipelineSteps,
          verification: streamResult.verification,
          citationWarnings: writingStream.citationWarnings,
          dataClaimWarnings: writingStream.dataClaimWarnings,
          detectedRefs: writingStream.detectedRefs,
          targetSection: targetSectionKey,
          subsectionTitle: subTitle,
          isStreaming: false,
        });
      }
    } catch (error: unknown) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast.error(error instanceof Error ? getErrorMessage(error) : "审查失败");
      }
      setGenerationStatus("completed");
    } finally {
      setIsGenerating(false);
    }
  }, [
    title,
    outlineTasks,
    selectedSectionId,
    writingStream,
    buildWritingRequest,
    onPreviewUpdate,
    targetSectionKey,
    setIsGenerating,
    setGenerationStatus,
    setVerificationFeedback,
    setManualPhase,
    setResult,
  ]);

  const handleApplyFix = useCallback(async () => {
    const draft = (resultRef.current || "").trim();
    const feedback = verificationFeedback.trim();
    if (!draft) {
      toast.error("缺少待修正的初稿");
      return;
    }
    if (!feedback) {
      toast.error("请先提交审查或填写审查意见");
      return;
    }

    setIsGenerating(true);
    setGenerationStatus("refining");

    try {
      const selectedTask = outlineTasks.find((t) => t.id === selectedSectionId);
      const subTitle = selectedTask && selectedTask.level > 1 ? selectedTask.title : undefined;

      const request = buildWritingRequest(draft, "fix_only", subTitle);
      request.verificationFeedback = feedback;

      const streamResult = await writingStream.start(request);

      setVerificationFeedback(streamResult.verification);
      const isChapterScope = !selectedTask || selectedTask.level <= 1;
      await applyGenerationResult(streamResult.content, subTitle, isChapterScope);
    } catch (error: unknown) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast.error(error instanceof Error ? getErrorMessage(error) : "修正失败");
      }
      setGenerationStatus("completed");
    } finally {
      setIsGenerating(false);
    }
  }, [
    verificationFeedback,
    writingStream,
    outlineTasks,
    selectedSectionId,
    buildWritingRequest,
    applyGenerationResult,
    targetSectionKey,
    setIsGenerating,
    setGenerationStatus,
    setVerificationFeedback,
  ]);

  return {
    resultRef,
    figureAbortRef,
    writingAbortRef,
    handleCancel,
    handleGenerate,
    handleSubmitAudit,
    handleApplyFix,
    syncDraft,
    bulletExpand,
  };
}
