"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, Eraser, Database } from "lucide-react";
import { toast } from "sonner";
import { projectStore } from "@/lib/store";
import type { ProjectData } from "@/contracts/project";
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

interface WritingPanelProps {
  projectId: string;
  project: ProjectData;
  editorActiveSection?: string;
  onGenerate?: (content: string, section: string, subsectionTitle?: string) => void;
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
  onUpdateProject,
  onGeneratingChange,
  onPreviewUpdate,
  preselectedTaskId,
  expandedSections,
  onTaskExpanded,
  onClearPreselected,
}: WritingPanelProps) {
  const [title, setTitle] = useState(project.title || "");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [targetSectionKey, setTargetSectionKey] = useState<string>("introduction");
  const [language, setLanguage] = useState("zh");
  const [retrievalMode, setRetrievalMode] = useState<"precise" | "balanced" | "extensive">("precise");
  const [fastMode, setFastMode] = useState(false);
  const [context, setContext] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [subsectionTitle, setSubsectionTitle] = useState<string | undefined>();
  const [result, setResult] = useState("");
  const [verificationFeedback, setVerificationFeedback] = useState("");
  const [detectedRefs, setDetectedRefs] = useState<string[]>([]);
  const [lastRefMapping, setLastRefMapping] = useState<Record<string, number> | null>(null);
  const [citationWarnings, setCitationWarnings] = useState<CitationWarning[]>([]);
  const [dataClaimWarnings, setDataClaimWarnings] = useState<DataClaimWarning[]>([]);
  const [, setPendingFigures] = useState<
    { spec: string; tool: string; config: string; caption: string; status: string; imageUrl?: string }[]
  >([]);

  const writingStream = useWritingStream();
  const projectMode = project.mode ?? "review";

  useEffect(() => {
    onGeneratingChange?.(isGenerating);
  }, [isGenerating, onGeneratingChange]);

  useWritingPanelPreviewSync({
    isGenerating,
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
      language,
      context,
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
      setLanguage,
      setContext,
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
        setContext(buildExpansionContext(currentSection, allSections, project.outline || "", projectMode));
      } else {
        setContext(
          `【扩写目标子节】：${task.fullPath}\n【写作要求】：请针对此主题展开学术论述。\n\n【论文大纲参考】：\n${(project.outline || "").slice(0, 400)}`,
        );
      }
    },
    [project.outline, projectMode],
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

  const { resultRef, figureAbortRef, writingAbortRef, handleCancel, handleGenerate } = useWritingPanelGenerate({
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
  });

  useEffect(() => {
    return () => {
      figureAbortRef.current?.abort();
      writingAbortRef.current?.abort();
    };
  }, [figureAbortRef, writingAbortRef]);

  const handleApplyToEditor = () => {
    applyToEditor(resultRef.current || result, targetSectionKey, subsectionTitle);
  };

  const handleReset = () => {
    setContext("");
    setResult("");
    setSelectedSectionId("");
    setVerificationFeedback("");
    setDetectedRefs([]);
    setLastRefMapping(null);
    setCitationWarnings([]);
    setDataClaimWarnings([]);
    writingStream.reset();
    setGenerationStatus("idle");
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6 pb-10">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold">大纲驱动扩写</CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              基于「论证提纲」（Outline 页）拆任务扩写；「存储至章节」会随工作台左侧 IMRaD
              当前章同步，也可改存到其他章。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title" className="text-xs">
                论文题目
              </Label>
              <Input
                id="title"
                placeholder="拟定的论文题目"
                className="text-xs h-8"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
              />
            </div>

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

            <div className="grid grid-cols-3 gap-2">
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
                <Label className="text-xs">语言</Label>
                <div className="flex h-8 border rounded-md overflow-hidden">
                  <button
                    type="button"
                    className={`flex-1 text-xs ${language === "zh" ? "bg-primary text-primary-foreground" : "bg-background"}`}
                    onClick={() => setLanguage("zh")}
                  >
                    中文
                  </button>
                  <button
                    type="button"
                    className={`flex-1 text-xs ${language === "en" ? "bg-primary text-primary-foreground" : "bg-background"}`}
                    onClick={() => setLanguage("en")}
                  >
                    EN
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">快速模式</Label>
                <div className="flex h-8 border rounded-md overflow-hidden">
                  <button
                    type="button"
                    className={`flex-1 text-xs ${fastMode ? "bg-primary text-primary-foreground" : "bg-background"}`}
                    onClick={() => setFastMode(true)}
                  >
                    快速
                  </button>
                  <button
                    type="button"
                    className={`flex-1 text-xs ${!fastMode ? "bg-primary text-primary-foreground" : "bg-background"}`}
                    onClick={() => setFastMode(false)}
                  >
                    完整
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 col-span-3">
                <Label className="text-xs">检索精度</Label>
                <Select
                  onValueChange={(val) => setRetrievalMode((val as "precise" | "balanced" | "extensive") || "balanced")}
                  value={retrievalMode}
                >
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="precise" className="text-xs">
                      精确（5篇）
                    </SelectItem>
                    <SelectItem value="balanced" className="text-xs">
                      平衡（20篇）
                    </SelectItem>
                    <SelectItem value="extensive" className="text-xs">
                      广泛（50篇）
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="context" className="text-xs">
                  任务上下文
                </Label>
                <div className="flex items-center gap-1">
                  {((isResearch && dataClaimsPreview.length > 0) || refCount > 0) && (
                    <span className="text-[9px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Database className="h-2.5 w-2.5" />
                      {isResearch && dataClaimsPreview.length > 0 && (
                        <span>{dataClaimsPreview.length} 数据证据</span>
                      )}
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
              </div>
              <Textarea
                id="context"
                placeholder="选择左侧大纲任务后，这里会自动填入写作要求..."
                className="text-xs min-h-[88px] max-h-[160px] overflow-y-auto resize-none bg-muted/5"
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 text-xs" disabled={isGenerating} onClick={handleReset}>
              <Eraser className="mr-1 h-3 w-3" /> 重置
            </Button>
            {isGenerating ? (
              <Button size="sm" variant="destructive" className="flex-[2] text-xs" onClick={handleCancel}>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" /> 取消扩写
              </Button>
            ) : (
              <Button size="sm" className="flex-[2] text-xs" onClick={handleGenerate} disabled={!selectedSectionId}>
                <Send className="mr-1 h-3 w-3" />
                {selectedSectionId ? "扩写选定章节" : "请先选择任务"}
              </Button>
            )}
          </CardFooter>
        </Card>

        {result && !onPreviewUpdate && (
          <WritingExpandResult
            result={result}
            generationStatus={generationStatus}
            citationWarnings={citationWarnings}
            dataClaimWarnings={dataClaimWarnings}
            lastRefMapping={lastRefMapping}
            detectedRefs={detectedRefs}
            verificationFeedback={verificationFeedback}
            pipelineSteps={writingStream.pipelineSteps}
            onApplyToEditor={handleApplyToEditor}
          />
        )}
      </div>
    </div>
  );
}
