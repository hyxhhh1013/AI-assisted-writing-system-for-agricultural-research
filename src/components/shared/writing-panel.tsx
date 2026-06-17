"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, Eraser, Database, SearchCheck, Wrench, Search, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { projectStore } from "@/lib/store";
import { getMinDraftChars, getWritingContextPlaceholder, isWritingDraftReady, contextLinesToBullets, MIN_WRITING_BULLETS, normalizeWritingBullets, shouldUseCollaborativeBulletExpand, type ManualWritingPhase, type WritingFlowMode } from "@/contracts/writing";
import { resolveProjectLanguage, type ProjectData } from "@/contracts/project";
import { parseWritingBlueprint } from "@/contracts/writing-blueprint";
import { useWritingStream } from "@/hooks/use-writing-stream";
import {
  parseOutline,
  buildExpansionContext,
  buildOutlineTasks,
  cleanDraftArtifacts,
  deduplicateParagraphs,
} from "@/lib/utils";
import type { OutlineTask } from "@/lib/utils";
import { buildTemplateSectionOptions, getTemplateSections } from "@/lib/template-sections";
import { buildSectionOptionsForMode } from "@/lib/section-registry";
import { WritingOutlineTaskList } from "@/components/shared/writing/writing-outline-task-list";
import { WritingExpandResult } from "@/components/shared/writing/writing-expand-result";
import type { WritingPreviewPayload, GenerationStatus, CitationWarning, DataClaimWarning } from "@/components/shared/writing/writing-types";
import { useWritingPanelSession } from "@/hooks/use-writing-panel-session";
import { useWritingPanelPreviewSync } from "@/hooks/use-writing-panel-preview-sync";
import { useWritingPanelGenerate } from "@/hooks/use-writing-panel-generate";
import { useWritingSourceSelection } from "@/hooks/use-writing-source-selection";
import { WritingBulletList } from "@/components/shared/writing/writing-bullet-list";
import { WritingBulletExpand } from "@/components/shared/writing/writing-bullet-expand";
import { WritingSourcePicker } from "@/components/shared/writing/writing-source-picker";

interface WritingPanelProps {
  projectId: string;
  project: ProjectData;
  editorActiveSection?: string;
  onGenerate?: (content: string, section: string, subsectionTitle?: string) => void;
  onDraftApplied?: (section: string, subsectionTitle?: string) => void;
  onUpdateProject?: (updates: Partial<ProjectData>) => void;
  onGeneratingChange?: (generating: boolean) => void;
  onPreviewUpdate?: (data: WritingPreviewPayload) => void;
  preselectedTaskId?: string | null;
  expandedSections?: string[];
  onTaskExpanded?: (taskIds: string | string[]) => void;
  onClearPreselected?: () => void;
}

export function WritingPanel({
  projectId,
  project,
  editorActiveSection,
  onGenerate,
  onDraftApplied,
  onUpdateProject,
  onGeneratingChange,
  onPreviewUpdate,
  preselectedTaskId,
  expandedSections,
  onTaskExpanded,
  onClearPreselected,
}: WritingPanelProps) {
  const projectMode = project.mode ?? "review";
  const language = resolveProjectLanguage(project);
  const [title, setTitle] = useState(project.title || "");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [targetSectionKey, setTargetSectionKey] = useState<string>("introduction");
  const [retrievalMode, setRetrievalMode] = useState<"precise" | "balanced" | "extensive">("precise");
  const [flowMode, setFlowMode] = useState<WritingFlowMode>("standard");
  const [manualPhase, setManualPhase] = useState<ManualWritingPhase>("idle");
  const [showFullModeConfirm, setShowFullModeConfirm] = useState(false);
  const [context, setContext] = useState("");
  const [bullets, setBullets] = useState<string[]>(() =>
    Array.from({ length: MIN_WRITING_BULLETS }, () => ""),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [subsectionTitle, setSubsectionTitle] = useState<string | undefined>();
  const [result, setResult] = useState("");
  const [verificationFeedback, setVerificationFeedback] = useState("");
  const [detectedRefs, setDetectedRefs] = useState<string[]>([]);
  const [lastRefMapping, setLastRefMapping] = useState<Record<string, number> | null>(null);
  const [citationWarnings, setCitationWarnings] = useState<CitationWarning[]>([]);
  const [dataClaimWarnings, setDataClaimWarnings] = useState<DataClaimWarning[]>([]);
  const [pendingFigures, setPendingFigures] = useState<
    { spec: string; tool: string; config: string; caption: string; status: string; imageUrl?: string }[]
  >([]);
  const [literatureOpen, setLiteratureOpen] = useState(false);

  const writingStream = useWritingStream();
  const writingBlueprint = useMemo(
    () => parseWritingBlueprint(project.writingBlueprint),
    [project.writingBlueprint],
  );

  useEffect(() => {
    onGeneratingChange?.(isGenerating);
  }, [isGenerating, onGeneratingChange]);

  useWritingPanelPreviewSync({
    isGenerating,
    generationStatus,
    panelResult: result,
    targetSectionKey,
    subsectionTitle,
    onPreviewUpdate,
    writingStream,
  });

  const outlineTasks: OutlineTask[] = useMemo(() => {
    if (!project.outline) return [];
    return buildOutlineTasks(project.outline, projectMode);
  }, [project.outline, projectMode]);

  const templateSections = useMemo(
    () =>
      projectMode === "review"
        ? buildSectionOptionsForMode(projectMode, language === "en" ? "en" : "zh")
        : buildTemplateSectionOptions(project.template || "sci", projectMode),
    [project.template, projectMode, language],
  );
  const templateSectionIds = useMemo(
    () =>
      new Set(
        getTemplateSections(project.template || "sci", projectMode).map((s) => s.key),
      ),
    [project.template, projectMode],
  );

  const { clearSession } = useWritingPanelSession({
    projectId,
    templateSectionIds,
    state: {
      title,
      selectedSectionId,
      targetSectionKey,
      context,
      bullets,
      result,
      verificationFeedback,
      generationStatus,
      detectedRefs,
      isGenerating,
    },
    setters: {
      setTitle,
      setSelectedSectionId,
      setTargetSectionKey,
      setContext,
      setBullets,
      setResult,
      setVerificationFeedback,
      setGenerationStatus,
      setDetectedRefs,
      setIsGenerating,
    },
  });

  useEffect(() => {
    if (!editorActiveSection || !templateSectionIds.has(editorActiveSection)) return;
    if (selectedSectionId) return;
    setTargetSectionKey(editorActiveSection);
  }, [editorActiveSection, selectedSectionId, templateSectionIds]);

  const handleSelectTask = useCallback(
    (task: OutlineTask) => {
      setSelectedSectionId(task.id);
      setTargetSectionKey(task.sectionKey);
      const allSections = parseOutline(project.outline || "");
      const currentSection = allSections.find((s) => s.id === task.id);
      if (currentSection) {
        setContext(buildExpansionContext(currentSection, allSections, project.outline || "", projectMode, writingBlueprint));
        const seed = currentSection.content.trim() || currentSection.title;
        setBullets(contextLinesToBullets(seed));
      } else {
        setContext(
          `【扩写目标子节】：${task.fullPath}\n【写作要求】：请针对此主题展开学术论述。\n\n【论文大纲参考】：\n${(project.outline || "").slice(0, 400)}`,
        );
        setBullets(contextLinesToBullets(task.title));
      }
    },
    [project.outline, projectMode, writingBlueprint],
  );

  useEffect(() => {
    if (outlineTasks.length === 0) return;
    if (preselectedTaskId) {
      const task = outlineTasks.find((t) => t.id === preselectedTaskId);
      if (task) {
        handleSelectTask(task);
        onClearPreselected?.();
        return;
      }
    }
    if (!selectedSectionId) {
      handleSelectTask(outlineTasks[0]);
    }
  }, [outlineTasks, preselectedTaskId, selectedSectionId, handleSelectTask, onClearPreselected]);

  useEffect(() => {
    if (project.title && title !== project.title && !isGenerating && result.length === 0) {
      setTitle(project.title);
    }
  }, [project.title, project.id, title, isGenerating, result.length]);

  const handleTitleBlur = () => {
    if (title !== project.title && onUpdateProject) {
      onUpdateProject({ title });
    }
  };

  const injectAnalysis = () => {
    if (project.analysisResults && project.analysisResults.length > 0) {
      const latest = project.analysisResults[project.analysisResults.length - 1];
      setContext((prev) => prev + (prev ? "\n\n" : "") + "【实验数据分析结论】：\n" + latest);
      toast.success("已将最新数据分析结果注入上下文");
    } else {
      toast.error("暂无已保存的数据分析结果");
    }
  };

  const applyToEditor = useCallback(
    (content: string, section: string, subsection?: string) => {
      let cleaned = cleanDraftArtifacts(content);
      cleaned = deduplicateParagraphs(cleaned);
      setResult(cleaned);
      if (onGenerate && cleaned && section) {
        onGenerate(cleaned, section, subsection);
      }
    },
    [onGenerate],
  );

  const sourceSelection = useWritingSourceSelection({
    title,
    section: targetSectionKey,
    context,
    bullets,
    language,
    retrievalMode,
    existingReferences: project.references || [],
    researchDirection: project.researchDirection,
    projectMode,
    draftReady: isWritingDraftReady(context, bullets, targetSectionKey),
  });

  const { resultRef, figureAbortRef, writingAbortRef, handleCancel, handleGenerate, handleSubmitAudit, handleApplyFix, syncDraft, bulletExpand } = useWritingPanelGenerate({
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
    selectedSourceIds: sourceSelection.confirmed ? sourceSelection.selectedSourceIds : undefined,
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
  });

  useEffect(() => {
    return () => {
      figureAbortRef.current?.abort();
      writingAbortRef.current?.abort();
    };
  }, [figureAbortRef, writingAbortRef]);

  const handleApplyToEditor = () => {
    applyToEditor(resultRef.current || result, targetSectionKey, subsectionTitle);
    onDraftApplied?.(targetSectionKey, subsectionTitle);
  };

  const handleReset = () => {
    setContext("");
    setBullets(Array.from({ length: MIN_WRITING_BULLETS }, () => ""));
    setResult("");
    setSelectedSectionId("");
    setVerificationFeedback("");
    setDetectedRefs([]);
    setLastRefMapping(null);
    setCitationWarnings([]);
    setDataClaimWarnings([]);
    setManualPhase("idle");
    writingStream.reset();
    setGenerationStatus("idle");
    sourceSelection.resetSelection();
    bulletExpand.reset();
    clearSession();
  };

  const dataClaimsPreview = (() => {
    try {
      return project.dataClaims ? JSON.parse(project.dataClaims) : [];
    } catch {
      return [];
    }
  })();
  const refCount = (project.references || []).length;
  const isResearch = project.mode === "research";
  const normalizedBullets = normalizeWritingBullets(bullets);
  const useCollaborativeExpand = shouldUseCollaborativeBulletExpand(flowMode, bullets);
  const minDraftChars = getMinDraftChars(targetSectionKey);
  const supplementCharCount = context.trim().length;
  const bulletCharCount = normalizedBullets.join("").length;
  const draftReady = isWritingDraftReady(context, bullets, targetSectionKey);
  const canGenerate = Boolean(selectedSectionId) && draftReady && sourceSelection.canGenerate;
  const generateDisabledReason = !selectedSectionId
    ? "请先选择左侧大纲任务"
    : !draftReady
      ? normalizedBullets.length >= MIN_WRITING_BULLETS
        ? `请确保每条要点至少 8 字，合计达到 ${minDraftChars} 字（当前 ${bulletCharCount + supplementCharCount} 字）`
        : `请填写至少 ${MIN_WRITING_BULLETS} 条扩写要点，或写出 ${minDraftChars} 字补充说明`
      : !sourceSelection.fetchedOnce
        ? "请先检索并确认文献"
        : sourceSelection.previewStale
          ? "要点已变更，请重新检索文献"
          : !sourceSelection.confirmed
            ? "请先确认文献选择"
            : undefined;

  const handleFetchLiterature = useCallback(async () => {
    setLiteratureOpen(true);
    await sourceSelection.fetchPreview();
  }, [sourceSelection.fetchPreview]);

  const handleFlowModeChange = (value: WritingFlowMode) => {
    if (value === "full") {
      setShowFullModeConfirm(true);
      return;
    }
    setFlowMode(value);
    setManualPhase("idle");
  };

  const handleConfirmFullMode = () => {
    setFlowMode("full");
    setManualPhase("idle");
    setShowFullModeConfirm(false);
  };

  const showManualDraftEditor =
    flowMode === "standard" && manualPhase !== "idle" && Boolean(result) && !onPreviewUpdate;
  const canSubmitAudit =
    flowMode === "standard" &&
    (manualPhase === "draft_ready" || manualPhase === "review_ready") &&
    Boolean((resultRef.current || result).trim()) &&
    !isGenerating;
  const canApplyFix =
    flowMode === "standard" &&
    manualPhase === "review_ready" &&
    Boolean(verificationFeedback.trim()) &&
    !isGenerating;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar space-y-3 pb-4">
        <WritingOutlineTaskList
          outlineTasks={outlineTasks}
          selectedSectionId={selectedSectionId}
          expandedSections={expandedSections}
          projectMode={projectMode}
          onSelectTask={handleSelectTask}
          onRefreshOutline={async () => {
            const latest = await projectStore.get(projectId);
            if (latest && onUpdateProject) {
              onUpdateProject({ outline: latest.outline });
              toast.success("已同步最新大纲");
            }
          }}
        />

        <WritingBulletList bullets={bullets} disabled={isGenerating} onChange={setBullets} />

        <div className="rounded-lg border bg-muted/10 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-medium">③ 文献来源</span>
            {sourceSelection.confirmed && !sourceSelection.previewStale && (
              <span className="text-[10px] text-green-700">
                已确认 {sourceSelection.selectedSourceIds.length} 篇
              </span>
            )}
            {sourceSelection.previewStale && (
              <span className="text-[10px] text-amber-700">要点已变，需重新检索</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={retrievalMode}
              onValueChange={(val) =>
                setRetrievalMode((val as "precise" | "balanced" | "extensive") || "balanced")
              }
              disabled={isGenerating}
            >
              <SelectTrigger className="h-8 flex-1 min-w-0 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="precise" className="text-xs">精确 · 约 10 篇</SelectItem>
                <SelectItem value="balanced" className="text-xs">平衡 · 约 20 篇</SelectItem>
                <SelectItem value="extensive" className="text-xs">广泛 · 约 60 篇</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant={sourceSelection.previewStale ? "default" : "outline"}
              size="sm"
              className="h-8 shrink-0 text-xs px-3"
              disabled={!draftReady || sourceSelection.loading || isGenerating}
              onClick={() => void handleFetchLiterature()}
            >
              {sourceSelection.loading ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Search className="mr-1 h-3 w-3" />
              )}
              {sourceSelection.previewStale ? "重新检索" : "检索"}
            </Button>
          </div>

          {(literatureOpen || sourceSelection.fetchedOnce) && (
            <WritingSourcePicker
              hits={sourceSelection.hits}
              selectedSourceIds={sourceSelection.selectedSourceIds}
              previewQuery={sourceSelection.previewQuery}
              loading={sourceSelection.loading}
              confirmed={sourceSelection.confirmed}
              fetchedOnce={sourceSelection.fetchedOnce}
              fetchError={sourceSelection.fetchError}
              previewStale={sourceSelection.previewStale}
              listMaxHeight="max-h-40"
              onToggle={sourceSelection.toggleSource}
              onSelectAll={sourceSelection.selectAll}
              onDeselectAll={sourceSelection.deselectAll}
              onConfirm={sourceSelection.confirmSelection}
            />
          )}

          {!sourceSelection.fetchedOnce && !literatureOpen && (
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              选好检索范围后点「检索」，勾选文献并确认即可扩写。
            </p>
          )}
        </div>

        <details className="group rounded-lg border bg-muted/10">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2.5 text-xs font-medium [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
            补充说明（可选）
            {supplementCharCount > 0 && (
              <span className="text-[10px] font-normal text-muted-foreground">· {supplementCharCount} 字</span>
            )}
          </summary>
          <div className="space-y-2 border-t px-3 pb-3 pt-2">
            <div className="flex items-center justify-end gap-1">
              {((isResearch && dataClaimsPreview.length > 0) || refCount > 0) && (
                <span className="text-[9px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded flex items-center gap-1 mr-auto">
                  <Database className="h-2.5 w-2.5" />
                  {isResearch && dataClaimsPreview.length > 0 && <span>{dataClaimsPreview.length} 数据证据</span>}
                  {isResearch && dataClaimsPreview.length > 0 && refCount > 0 && <span>·</span>}
                  {refCount > 0 && <span>{refCount} 文献</span>}
                </span>
              )}
              {project.mode === "research" && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={injectAnalysis} title="注入实验数据">
                  <Database className="h-3 w-3" />
                </Button>
              )}
            </div>
            <Textarea
              id="context"
              placeholder={`大纲背景、实验数据或 ${getWritingContextPlaceholder(targetSectionKey).slice(0, 40)}…`}
              className="text-xs min-h-[72px] max-h-[120px] resize-none"
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </div>
        </details>

        <details className="group rounded-lg border bg-muted/10">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2.5 text-xs font-medium [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
            扩写设置
          </summary>
          <div className="space-y-3 border-t px-3 pb-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="title" className="text-xs">论文题目</Label>
              <Input
                id="title"
                placeholder="拟定的论文题目"
                className="text-xs h-8"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">目标章节</Label>
              <Select onValueChange={(val) => setTargetSectionKey(val || "")} value={targetSectionKey}>
                <SelectTrigger className="text-xs h-8">
                  <SelectValue placeholder="目标章节" />
                </SelectTrigger>
                <SelectContent>
                  {templateSections.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="text-xs">
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">扩写流程</Label>
              <Select value={flowMode} onValueChange={(val) => handleFlowModeChange(val as WritingFlowMode)}>
                <SelectTrigger className="text-xs h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard" className="text-xs">标准（人控）</SelectItem>
                  <SelectItem value="preview" className="text-xs">快速预览</SelectItem>
                  <SelectItem value="full" className="text-xs">完整模式（实验）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </details>

        <p className="text-[10px] text-muted-foreground px-1">
          要点 {normalizedBullets.length}/{MIN_WRITING_BULLETS} 条
          {!draftReady ? ` · 需至少 ${minDraftChars} 字才可扩写` : ""}
        </p>

        {bulletExpand.active && (
          <WritingBulletExpand
            bulletIndex={bulletExpand.bulletIndex}
            totalBullets={bulletExpand.totalBullets}
            bulletLabel={bulletExpand.normalizedBullets[bulletExpand.bulletIndex] ?? ""}
            currentText={bulletExpand.currentBulletText}
            onCurrentTextChange={bulletExpand.setCurrentBulletText}
            mergePreview={bulletExpand.mergePreview}
            showMergePreview={bulletExpand.showMergePreview}
            onToggleMergePreview={() => bulletExpand.setShowMergePreview((v) => !v)}
            isGenerating={isGenerating}
            onAdoptAndNext={() => void bulletExpand.adoptAndNext()}
            onRewrite={() => void bulletExpand.rewriteCurrent()}
          />
        )}

        {flowMode === "standard" && manualPhase !== "idle" && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">人控审查流程</CardTitle>
              <CardDescription className="text-xs">
                {manualPhase === "draft_ready" && "初稿已就绪：可编辑后提交审查。"}
                {manualPhase === "review_ready" && "审查完成：可编辑意见后按意见修正。"}
                {manualPhase === "done" && "修正已完成，可应用到编辑器或继续修改。"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {showManualDraftEditor && (
                <div className="space-y-1.5">
                  <Label className="text-xs">编辑初稿</Label>
                  <Textarea
                    className="text-xs min-h-[120px] max-h-[240px] resize-y"
                    value={result}
                    onChange={(e) => syncDraft(e.target.value)}
                  />
                </div>
              )}
              {manualPhase === "review_ready" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">审查意见（可编辑）</Label>
                  <Textarea
                    className="text-xs min-h-[88px] max-h-[200px] resize-y"
                    value={verificationFeedback}
                    onChange={(e) => setVerificationFeedback(e.target.value)}
                  />
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="text-xs" disabled={!canSubmitAudit} onClick={handleSubmitAudit}>
                <SearchCheck className="mr-1 h-3 w-3" />
                提交审查
              </Button>
              <Button size="sm" className="text-xs" disabled={!canApplyFix} onClick={handleApplyFix}>
                <Wrench className="mr-1 h-3 w-3" />
                按意见修正
              </Button>
            </CardFooter>
          </Card>
        )}

        {result && !onPreviewUpdate && (
          <WritingExpandResult
            projectId={projectId}
            result={result}
            generationStatus={generationStatus}
            citationWarnings={citationWarnings}
            dataClaimWarnings={dataClaimWarnings}
            lastRefMapping={lastRefMapping}
            detectedRefs={detectedRefs}
            verificationFeedback={verificationFeedback}
            pipelineSteps={writingStream.pipelineSteps}
            detectedFigures={pendingFigures.map(({ tool, config, caption }) => ({
              tool,
              config,
              caption,
            }))}
            onApplyToEditor={handleApplyToEditor}
          />
        )}
      </div>

      <div className="shrink-0 pt-3 border-t flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 text-xs" disabled={isGenerating} onClick={handleReset}>
          <Eraser className="mr-1 h-3 w-3" /> 重置
        </Button>
        {isGenerating ? (
          <Button size="sm" variant="destructive" className="flex-[2] text-xs" onClick={handleCancel}>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> 取消扩写
          </Button>
        ) : bulletExpand.active ? (
          <Button size="sm" className="flex-[2] text-xs" disabled title="请在上方逐条面板中采纳或重写">
            逐条扩写进行中…
          </Button>
        ) : (
          <Button
            size="sm"
            className="flex-[2] text-xs"
            onClick={handleGenerate}
            disabled={!canGenerate}
            title={generateDisabledReason}
          >
            <Send className="mr-1 h-3 w-3" />
            {canGenerate
              ? useCollaborativeExpand
                ? "开始逐条扩写"
                : "扩写选定章节"
              : generateDisabledReason}
          </Button>
        )}
      </div>

      <Dialog open={showFullModeConfirm} onOpenChange={setShowFullModeConfirm}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>切换到完整模式（实验）？</DialogTitle>
            <DialogDescription>
              将自动依次运行写作、审稿核查与主编修正，耗时更长且占用更多服务器资源。推荐使用「标准（人控）」或「快速预览」。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowFullModeConfirm(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleConfirmFullMode}>
              确认使用完整模式
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
