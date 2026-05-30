"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, Copy, Eraser, FileText, Database, ScrollText, CheckCircle2, ChevronRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { projectStore, ProjectData } from "@/lib/store";
import { MarkdownContent } from "@/components/shared/previews/shared";
import { useWritingStream } from "@/hooks/use-writing-stream";
import { PipelineTimeline } from "@/components/shared/pipeline-timeline";
import { findFigureBlocks, generateSingleFigure, replacePlaceholders } from "@/hooks/use-figure-pipeline";
import { cn, parseOutline, mapToIMRADSection, buildExpansionContext, buildOutlineTasks, countProjectFigures, cleanDraftArtifacts, deduplicateParagraphs } from "@/lib/utils";
import type { OutlineTask } from "@/lib/utils";

const WRITING_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const writingSessionKey = (projectId: string) => `agri_ai_writing_session_${projectId}`;

interface PersistedWritingSession {
  version: 1;
  updatedAt: number;
  title: string;
  selectedSectionId: string;
  targetSectionKey: string;
  language: string;
  context: string;
  result: string;
  verificationFeedback: string;
  generationStatus: string;
  detectedRefs: string[];
  wasGenerating: boolean;
}

import { IMRAD_SECTION_KEYS, IMRAD_LABELS_ZH } from "@/lib/imrad";
import { buildTemplateSectionOptions, getTemplateSections } from "@/lib/template-sections";

interface WritingPanelProps {
  projectId: string;
  project: ProjectData;
  editorActiveSection?: string;
  onGenerate?: (content: string, section: string, subsectionTitle?: string) => void;
  onUpdateProject?: (updates: Partial<ProjectData>) => void;
  onGeneratingChange?: (generating: boolean) => void;
  onPreviewUpdate?: (data: { content: string; pipelineSteps: import("@/hooks/use-writing-stream").PipelineStep[]; verification: string; citationWarnings: { num: number; overlap: number; context: string }[]; dataClaimWarnings: { claimId: string; claimText: string; found: boolean; citedCorrectly: boolean; issue?: string }[]; detectedRefs: string[]; targetSection: string; subsectionTitle?: string; isStreaming?: boolean }) => void;
  /** 从大纲面板传入的待扩写任务 ID，替代 sessionStorage */
  preselectedTaskId?: string | null;
  /** 已扩写的子节 ID 列表 */
  expandedSections?: string[];
  /** 扩写完成后回调，通知父组件标记该子节已扩写 */
  onTaskExpanded?: (taskId: string) => void;
  /** 清除 preselectedTaskId */
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
  const [fastMode, setFastMode] = useState(false); // 默认完整模式：Writer + Verifier + Refiner + 引用核查
  const [context, setContext] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<"idle" | "retrieving" | "building_context" | "writing" | "verifying" | "refining" | "checking_citations" | "generating_figures" | "completed">("idle");

  // 通知父组件生成状态变化（用于 tab 图标脉冲提示）
  useEffect(() => {
    onGeneratingChange?.(isGenerating);
  }, [isGenerating, onGeneratingChange]);
  const [subsectionTitle, setSubsectionTitle] = useState<string | undefined>();
  const [result, setResult] = useState("");
  const [verificationFeedback, setVerificationFeedback] = useState("");
  const [detectedRefs, setDetectedRefs] = useState<string[]>([]);
  const [citationWarnings, setCitationWarnings] = useState<{ num: number; overlap: number; context: string }[]>([]);
  const [dataClaimWarnings, setDataClaimWarnings] = useState<{ claimId: string; claimText: string; found: boolean; citedCorrectly: boolean; issue?: string }[]>([]);
  const [pendingFigures, setPendingFigures] = useState<{ spec: string; tool: string; config: string; caption: string; status: string; imageUrl?: string }[]>([]);
  const figureCountRef = useRef(0);
  const detectedFiguresRef = useRef<{ tool: string; config: string; caption: string }[]>([]);
  const figureAbortRef = useRef<AbortController | null>(null);
  const writingAbortRef = useRef<AbortController | null>(null);
  const resultRef = useRef("");
  const writingStream = useWritingStream();

  // 扩写过程中将输出推送到中间编辑器（节流：最多每 250ms 更新一次，避免逐字重渲染）
  // 关键：isGenerating 变 false 时必须立即推送最终状态，否则 pipelineSteps 最后几步丢失
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevGeneratingRef = useRef(isGenerating);
  useEffect(() => {
    if (!onPreviewUpdate) return;

    // isGenerating 从 true → false：立即推送最终状态（含所有 pipelineSteps）
    if (prevGeneratingRef.current && !isGenerating) {
      if (previewTimerRef.current) { clearTimeout(previewTimerRef.current); previewTimerRef.current = null; }
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
    if (previewTimerRef.current) return; // 已有待处理的更新，跳过
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
      if (previewTimerRef.current) { clearTimeout(previewTimerRef.current); previewTimerRef.current = null; }
    };
  }, [isGenerating, writingStream.result, writingStream.pipelineSteps, writingStream.verificationFeedback, writingStream.citationWarnings, writingStream.dataClaimWarnings, writingStream.detectedRefs, targetSectionKey, subsectionTitle, onPreviewUpdate]);

  // 仅在组件卸载时 abort 生图，避免资源泄漏
  useEffect(() => {
    return () => {
      figureAbortRef.current?.abort();
      writingAbortRef.current?.abort();
    };
  }, []);

  const restoredRef = useRef(false);

  // 从真实大纲解析任务列表（替代硬编码的 FIVE_TASKS）
  const outlineTasks: OutlineTask[] = useMemo(() => {
    if (!project.outline) return [];
    return buildOutlineTasks(project.outline);
  }, [project.outline]);

  // 模板驱动的 section 选项（替代硬编码 IMRAD）
  const templateSections = useMemo(() => buildTemplateSectionOptions(project.template || "sci"), [project.template]);
  const templateSectionIds = useMemo(() => new Set(getTemplateSections(project.template || "sci").map(s => s.key)), [project.template]);

  // 仅在未选中大纲任务时，随编辑器当前章节同步「存储至章节」
  // 有选中任务时以任务映射的 IMRaD 章节为准，避免被编辑器默认值覆盖
  useEffect(() => {
    if (!editorActiveSection || !templateSectionIds.has(editorActiveSection)) return;
    if (selectedSectionId) return; // 有任务选中时不覆盖
    setTargetSectionKey(editorActiveSection);
  }, [editorActiveSection, selectedSectionId]);

  // 离开页面/刷新后恢复扩写草稿（sessionStorage）
  useEffect(() => {
    restoredRef.current = false;
    if (!projectId) return;
    try {
      const raw = sessionStorage.getItem(writingSessionKey(projectId));
      if (!raw) {
        restoredRef.current = true;
        return;
      }
      const s = JSON.parse(raw) as Partial<PersistedWritingSession>;
      if (s.version !== 1 || typeof s.updatedAt !== "number") {
        restoredRef.current = true;
        return;
      }
      if (Date.now() - s.updatedAt > WRITING_SESSION_MAX_AGE_MS) {
        sessionStorage.removeItem(writingSessionKey(projectId));
        restoredRef.current = true;
        return;
      }
      if (typeof s.title === "string") setTitle(s.title);
      if (typeof s.selectedSectionId === "string") setSelectedSectionId(s.selectedSectionId);
      if (
        typeof s.targetSectionKey === "string" &&
        templateSectionIds.has(s.targetSectionKey)
      ) {
        setTargetSectionKey(s.targetSectionKey);
      }
      if (typeof s.language === "string") setLanguage(s.language);
      if (typeof s.context === "string") setContext(s.context);
      if (typeof s.result === "string") setResult(s.result);
      if (typeof s.verificationFeedback === "string") setVerificationFeedback(s.verificationFeedback);
      if (s.generationStatus) setGenerationStatus(s.generationStatus as "idle" | "retrieving" | "building_context" | "writing" | "verifying" | "refining" | "checking_citations" | "generating_figures" | "completed");
      if (Array.isArray(s.detectedRefs)) setDetectedRefs(s.detectedRefs);
      if (s.wasGenerating) {
        setIsGenerating(false);
        if (s.generationStatus && s.generationStatus !== "completed") {
          setGenerationStatus("idle");
        }
        toast.info("上次扩写未在页面内跑完，已恢复已生成的内容；需要完整核查与修正请重新点击扩写。");
      }
    } catch {
      /* ignore */
    }
    restoredRef.current = true;
  }, [projectId]);


  // 持久化当前扩写 UI（防抖），便于离开工作台/刷新后恢复
  useEffect(() => {
    if (!projectId || !restoredRef.current) return;
    const t = window.setTimeout(() => {
      try {
        const payload: PersistedWritingSession = {
          version: 1,
          updatedAt: Date.now(),
          title,
          selectedSectionId,
          targetSectionKey,
          language,
          context,
          result,
          verificationFeedback,
          generationStatus,
          detectedRefs,
          wasGenerating: isGenerating,
        };
        sessionStorage.setItem(writingSessionKey(projectId), JSON.stringify(payload));
      } catch {
        /* quota / private mode */
      }
    }, 400);
    return () => {
      window.clearTimeout(t);
      // 不在此处 abort 生图——result 更新会触发 cleanup，把后续图全杀掉
    };
  }, [
    projectId,
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
  ]);

  const handleSelectTask = useCallback((task: OutlineTask) => {
    setSelectedSectionId(task.id);
    setTargetSectionKey(task.sectionKey);
    // 使用 buildExpansionContext 构建精准上下文（仅相关子节，非整个大纲）
    const allSections = parseOutline(project.outline || "");
    const currentSection = allSections.find((s) => s.id === task.id);
    if (currentSection) {
      setContext(buildExpansionContext(currentSection, allSections, project.outline || ""));
    } else {
      // fallback：parseOutline 出来的 ID 对不上时用 task 自身信息
      setContext(`【扩写目标子节】：${task.fullPath}\n【写作要求】：请针对此主题展开学术论述。\n\n【论文大纲参考】：\n${(project.outline || "").slice(0, 400)}`);
    }
  }, [project.outline]);

  // 3. 自动选中逻辑：优先处理从大纲面板传来的预选任务
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

    // 无预选任务时默认选中第一个
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

  const handleCancel = () => {
    writingStream.cancel();
    figureAbortRef.current?.abort();
    setIsGenerating(false);
    setGenerationStatus("idle");
  };

  const handleGenerate = async () => {
    if (!title || !context) {
      toast.error("请填写完整信息");
      return;
    }

    // writingStream 内部管理 AbortController，自动取消前一个请求

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

      const selectedTask = outlineTasks.find(t => t.id === selectedSectionId);
      const subTitle = selectedTask && selectedTask.level > 1 ? selectedTask.title : undefined;
      setSubsectionTitle(subTitle);

      const existingFigures = countProjectFigures(project, targetSectionKey);

      // 构建数据证据声明列表（从 project.dataClaims JSON 解析）
      const dataClaims = (() => {
        try {
          return project.dataClaims ? JSON.parse(project.dataClaims) : [];
        } catch { return []; }
      })();

      // 使用统一的 SSE hook
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
          analysisResults: project.analysisResults || []
        }
      });

      // Sync stream results back to component state (use return value, not hook state)
      setResult(streamResult.content);
      resultRef.current = streamResult.content;
      setVerificationFeedback(streamResult.verification);
      setDetectedRefs(streamResult.references);
      setCitationWarnings(streamResult.citationWarnings);
      setDataClaimWarnings(streamResult.dataClaimWarnings);
      if (streamResult.references.length > 0 && onUpdateProject) {
        onUpdateProject({ references: streamResult.references });
      }

      // ReferenceSource 持久化：将 refMapping 写入数据库
      if (streamResult.refMapping && Object.keys(streamResult.refMapping).length > 0) {
        const mappings = Object.entries(streamResult.refMapping).map(([sourceName, refIndex]) => ({
          refIndex,
          sourceName,
          category: "",
          citation: "",
        }));
        fetch("/api/references?batch=true", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, mappings }),
        }).catch(() => { /* 静默失败，不影响主流程 */ });
      }

      // 流结束后：扫描完整结果文本中的 FIGURE 标记和插图占位
      const fullText = resultRef.current;

      // 1. 处理插图占位符
      const { processedText: phText, count: placeholderCount } = replacePlaceholders(fullText);
      if (placeholderCount > 0) {
        setResult(phText);
        resultRef.current = phText;
      }

      // 2. 处理可执行 FIGURE 标记
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

      // 2.5 检查是否有未被成功解析的 FIGURE 标记
      const rawFigureCount = (processedText.match(/[【\[]FIG(?:URE)?:\{/gi) || []).length;
      if (rawFigureCount > 0) {
        toast.warning(`发现 ${rawFigureCount} 个图表标记格式异常，已保留原文标记，请手动处理`);
        // 不清除这些标记，让用户看到原始内容
      }

      if (detectedFigures.length > 0) {
        setResult(processedText);
        resultRef.current = processedText;
        detectedFiguresRef.current = detectedFigures;
        setPendingFigures(detectedFigures.map(f => ({ ...f, spec: "", status: "pending" as const })));

        setGenerationStatus("generating_figures");
        toast.info(`正在自动生成 ${detectedFigures.length} 张配图...`);
        const _abort = new AbortController();
        figureAbortRef.current = _abort;
        (async () => {
          const _figs = detectedFiguresRef.current;
          for (let i = 0; i < _figs.length; i++) {
            if (_abort.signal.aborted) break;
            setPendingFigures(prev => prev.map((f, j) => j === i ? { ...f, status: "generating" } : f));
            const fig = _figs[i];
            if (!fig) continue;
            try {
              const cfg = JSON.parse(fig.config);
              const genResult = await generateSingleFigure(fig.tool, cfg, fig.caption, _abort.signal);
              const tag = `*[正在生成 ${fig.caption}...]*`;
              if (genResult.url) {
                const md = `\n\n![${fig.caption}](${genResult.url})\n\n`;
                resultRef.current = resultRef.current.replace(tag, md);
                setResult(resultRef.current);
                setPendingFigures(prev => prev.map((f, j) => j === i ? { ...f, status: "done", imageUrl: genResult.url } : f));
              } else {
                const reason = genResult.error || "生成失败";
                const fallback = `\n\n> 📊 **${fig.caption}**（${reason}，请手动补充）\n\n`;
                resultRef.current = resultRef.current.replace(tag, fallback);
                setResult(resultRef.current);
                setPendingFigures(prev => prev.map((f, j) => j === i ? { ...f, status: "failed" } : f));
              }
            } catch (e) {
              console.warn("[Figure] Generation failed for", fig.caption, e);
              const tag = `*[正在生成 ${fig.caption}...]*`;
              const fallback = `\n\n> 📊 **${fig.caption}**（生成异常，请手动补充）\n\n`;
              resultRef.current = resultRef.current.replace(tag, fallback);
              setResult(resultRef.current);
              setPendingFigures(prev => prev.map((f, j) => j === i ? { ...f, status: "failed" } : f));
            }
          }
          toast.success("配图生成完成");
          setGenerationStatus("completed");
          // 同步最终结果到父组件的 aiPreview，确保编辑器工具栏"应用"也拿到图片版内容
          if (onPreviewUpdate) {
            onPreviewUpdate({
              content: resultRef.current,
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
          handleApplyToEditor();
        })();
      } else {
        setGenerationStatus("completed");
      }
      // 标记当前任务已扩写
      if (selectedSectionId && onTaskExpanded) {
        onTaskExpanded(selectedSectionId);
      }
    } catch (error: unknown) {
      // AbortError 由 writingStream 内部处理
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast.error(error instanceof Error ? error.message : "写作生成失败");
      }
      setGenerationStatus("idle");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyToEditor = () => {
    let content = resultRef.current || result;
    content = cleanDraftArtifacts(content);
    content = deduplicateParagraphs(content);
    resultRef.current = content;
    setResult(content);
    if (onGenerate && content && targetSectionKey) {
      onGenerate(content, targetSectionKey, subsectionTitle);
    }
  };

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

            {/* 大纲任务列表 — 按 IMRaD 大类分组 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">选择大纲任务（按子节扩写）</Label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-primary"
                  onClick={async () => {
                    const latest = await projectStore.get(projectId);
                    if (latest && onUpdateProject) {
                      onUpdateProject({ outline: latest.outline });
                      toast.success("已同步最新大纲");
                    }
                  }}
                  title="刷新大纲任务"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
              <div className="border rounded-md max-h-[240px] overflow-y-auto bg-muted/20">
                {outlineTasks.length > 0 ? (
                  (() => {
                    // 按 IMRaD 大节分组
                    const IMRAD_ORDER = IMRAD_SECTION_KEYS as readonly string[];
                    const IMRAD_LABELS: Record<string, string> = IMRAD_LABELS_ZH;
                    const grouped = new Map<string, OutlineTask[]>();
                    for (const t of outlineTasks) {
                      const key = t.sectionKey;
                      if (!grouped.has(key)) grouped.set(key, []);
                      grouped.get(key)!.push(t);
                    }

                    const rows: React.ReactNode[] = [];
                    for (const key of IMRAD_ORDER) {
                      const tasks = grouped.get(key);
                      if (!tasks || tasks.length === 0) continue;
                      rows.push(
                        <div key={`hdr-${key}`} className="px-2 py-1 text-[10px] font-bold text-muted-foreground bg-muted/40 uppercase tracking-wider border-b">
                          {IMRAD_LABELS[key] || key}
                        </div>
                      );
                      for (const task of tasks) {
                        const isExpanded = expandedSections?.includes(task.id);
                        rows.push(
                          <div
                            key={task.id}
                            onClick={() => handleSelectTask(task)}
                            className={cn(
                              "flex items-center justify-between p-2 cursor-pointer transition-colors hover:bg-primary/10",
                              selectedSectionId === task.id ? "bg-primary/15 border-l-2 border-primary" : "",
                            )}
                          >
                            <div className="flex items-center gap-2 overflow-hidden min-w-0">
                              <span className="truncate text-xs">{task.title}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {isExpanded && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                              <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            </div>
                          </div>
                        );
                      }
                    }
                    return <div className="divide-y">{rows}</div>;
                  })()
                ) : (
                  <div className="p-4 text-center text-xs text-muted-foreground italic">
                    请先生成论文大纲
                  </div>
                )}
              </div>
            </div>

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
                  <button className={`flex-1 text-xs ${language === "zh" ? "bg-primary text-primary-foreground" : "bg-background"}`} onClick={() => setLanguage("zh")}>中文</button>
                  <button className={`flex-1 text-xs ${language === "en" ? "bg-primary text-primary-foreground" : "bg-background"}`} onClick={() => setLanguage("en")}>EN</button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">快速模式</Label>
                <div className="flex h-8 border rounded-md overflow-hidden">
                  <button className={`flex-1 text-xs ${fastMode ? "bg-primary text-primary-foreground" : "bg-background"}`} onClick={() => setFastMode(true)}>快速</button>
                  <button className={`flex-1 text-xs ${!fastMode ? "bg-primary text-primary-foreground" : "bg-background"}`} onClick={() => setFastMode(false)}>完整</button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">检索精度</Label>
                <Select onValueChange={(val) => setRetrievalMode(val as any || "balanced")} value={retrievalMode}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="precise" className="text-xs">精确（5篇）</SelectItem>
                    <SelectItem value="balanced" className="text-xs">平衡（20篇）</SelectItem>
                    <SelectItem value="extensive" className="text-xs">广泛（50篇）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="context" className="text-xs">任务上下文</Label>
                <div className="flex items-center gap-1">
                  {/* 证据可用性指示 */}
                  {(() => {
                    const dataClaims = (() => { try { return project.dataClaims ? JSON.parse(project.dataClaims) : []; } catch { return []; } })();
                    const refCount = (project.references || []).length;
                    if (dataClaims.length === 0 && refCount === 0) return null;
                    return (
                      <span className="text-[9px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Database className="h-2.5 w-2.5" />
                        {dataClaims.length > 0 && <span>{dataClaims.length} 数据证据</span>}
                        {dataClaims.length > 0 && refCount > 0 && <span>·</span>}
                        {refCount > 0 && <span>{refCount} 文献</span>}
                      </span>
                    );
                  })()}
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={injectAnalysis} title="注入实验数据">
                    <Database className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <Textarea
                id="context"
                placeholder="选择左侧大纲任务后，这里会自动填入写作要求..."
                className="text-xs min-h-[100px] bg-muted/5"
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 text-xs" disabled={isGenerating} onClick={() => {
              setContext(""); setResult(""); setSelectedSectionId("");
              setVerificationFeedback("");
              setDetectedRefs([]);
              setCitationWarnings([]);
              setDataClaimWarnings([]);
              writingStream.reset();
              setGenerationStatus("idle");
              try {
                sessionStorage.removeItem(writingSessionKey(projectId));
              } catch {
                /* ignore */
              }
            }}>
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
          <Card className="flex flex-col min-h-[300px] bg-primary/5 border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between py-3 border-b">
              <CardTitle className="text-sm font-bold">AI 生成内容</CardTitle>
              <div className="flex gap-1">
                <Button variant="default" size="sm" className="h-7 text-[10px]" onClick={handleApplyToEditor}
                  disabled={generationStatus === "generating_figures"}>
                  {generationStatus === "generating_figures" ? "配图生成中..." : "应用到编辑器"}
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                  navigator.clipboard.writeText(result);
                  toast.success("已复制");
                }}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-4 space-y-4">
              {citationWarnings.length > 0 && (
                <div className="bg-red-50 p-3 rounded-md border border-red-200 mb-2">
                  <div className="text-[10px] font-bold text-red-700 mb-1 flex items-center gap-1 uppercase">
                    <ScrollText className="h-3 w-3" /> 引用真实性警告
                  </div>
                  <p className="text-[9px] text-red-600 mb-2">
                    以下引用在文献库中未找到足够的文本依据，可能为模型虚构。建议人工核实：
                  </p>
                  <ul className="space-y-1">
                    {citationWarnings.map((w, i) => (
                      <li key={i} className="text-[9px] text-red-700 bg-red-100/50 p-1.5 rounded">
                        <span className="font-bold">[{w.num}]</span> 重叠度 {w.overlap}%
                        <span className="block text-red-500 truncate mt-0.5">&ldquo;{w.context}&rdquo;</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {dataClaimWarnings.length > 0 && (
                <div className="bg-orange-50 p-3 rounded-md border border-orange-200 mb-2">
                  <div className="text-[10px] font-bold text-orange-700 mb-1 flex items-center gap-1 uppercase">
                    <Database className="h-3 w-3" /> 数据证据核查警告
                  </div>
                  <p className="text-[9px] text-orange-600 mb-2">
                    以下数据证据声明在生成文本中未正确引用或数值不一致：
                  </p>
                  <ul className="space-y-1">
                    {dataClaimWarnings.map((w, i) => (
                      <li key={i} className="text-[9px] text-orange-700 bg-orange-100/50 p-1.5 rounded">
                        <span className="font-bold">[{w.claimId}]</span>{" "}
                        {!w.found ? "未引用" : "数值不一致"}
                        <span className="block text-orange-500 truncate mt-0.5">
                          {w.claimText}
                          {w.issue && <span className="block text-red-500">{w.issue}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detectedRefs.length > 0 && (
                <div className="bg-background/50 p-2 rounded-md border border-dashed border-primary/30">
                  <div className="text-[10px] font-bold text-primary mb-1 flex items-center gap-1 uppercase">
                    <Database className="h-3 w-3" /> 自动引用的文献:
                  </div>
                  <ul className="text-[9px] text-muted-foreground list-decimal list-inside">
                    {detectedRefs.map((ref, i) => (
                      <li key={i} className="truncate">{ref}</li>
                    ))}
                  </ul>
                </div>
              )}

              {writingStream.pipelineSteps.length > 0 && (
                <PipelineTimeline steps={writingStream.pipelineSteps} className="mb-3" />
              )}

              {verificationFeedback && (
                <div className="p-3 bg-amber-50 text-amber-800 rounded-md border border-amber-200">
                  <div className="text-[10px] font-bold mb-1 flex items-center gap-1 uppercase">
                    <ScrollText className="h-3 w-3" /> 学术核查意见:
                  </div>
                  <div className="text-[10px] whitespace-pre-wrap italic leading-relaxed">
                    {verificationFeedback}
                  </div>
                </div>
              )}

              <div className="leading-relaxed text-[11px]">
                <MarkdownContent content={result} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
