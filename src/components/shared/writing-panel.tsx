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
import { cn, parseOutline, mapToIMRADSection, buildExpansionContext, buildOutlineTasks, countProjectFigures } from "@/lib/utils";
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
  generationStatus: "idle" | "writing" | "verifying" | "refining" | "completed";
  detectedRefs: string[];
  wasGenerating: boolean;
}

const DEFAULT_SECTIONS = [
  { value: "abstract", label: "摘要 (Abstract)" },
  { value: "introduction", label: "引言 (Introduction)" },
  { value: "methods", label: "材料与方法 (Methods)" },
  { value: "results", label: "结果与讨论 (Results & Discussion)" },
  { value: "conclusion", label: "结论 (Conclusion)" },
];

const IMRAD_SECTION_IDS = new Set([
  "abstract",
  "introduction",
  "methods",
  "results",
  "conclusion",
]);

interface WritingPanelProps {
  projectId: string;
  project: ProjectData;
  editorActiveSection?: string;
  onGenerate?: (content: string, section: string, subsectionTitle?: string) => void;
  onUpdateProject?: (updates: Partial<ProjectData>) => void;
  onGeneratingChange?: (generating: boolean) => void;
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
  const [fastMode, setFastMode] = useState(true); // 快速模式：跳过审查，只跑 Writer
  const [context, setContext] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<"idle" | "writing" | "verifying" | "refining" | "completed">("idle");

  // 通知父组件生成状态变化（用于 tab 图标脉冲提示）
  useEffect(() => {
    onGeneratingChange?.(isGenerating);
  }, [isGenerating, onGeneratingChange]);
  const [subsectionTitle, setSubsectionTitle] = useState<string | undefined>();
  const [result, setResult] = useState("");
  const [verificationFeedback, setVerificationFeedback] = useState("");
  const [detectedRefs, setDetectedRefs] = useState<string[]>([]);
  const [citationWarnings, setCitationWarnings] = useState<{ num: number; overlap: number; context: string }[]>([]);
  const [pendingFigures, setPendingFigures] = useState<{ spec: string; tool: string; config: string; caption: string; status: string; imageUrl?: string }[]>([]);
  const figureCountRef = useRef(0);
  const detectedFiguresRef = useRef<{ tool: string; config: string; caption: string }[]>([]);
  const figureAbortRef = useRef<AbortController | null>(null);
  const resultRef = useRef("");

  const restoredRef = useRef(false);

  // 从真实大纲解析任务列表（替代硬编码的 FIVE_TASKS）
  const outlineTasks: OutlineTask[] = useMemo(() => {
    if (!project.outline) return [];
    return buildOutlineTasks(project.outline);
  }, [project.outline]);

  // 先随工作台左侧 IMRaD 章节同步「存储至章节」；再由下方 session 覆盖（若有草稿）
  useEffect(() => {
    if (!editorActiveSection || !IMRAD_SECTION_IDS.has(editorActiveSection)) return;
    setTargetSectionKey(editorActiveSection);
  }, [editorActiveSection]);

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
        IMRAD_SECTION_IDS.has(s.targetSectionKey)
      ) {
        setTargetSectionKey(s.targetSectionKey);
      }
      if (typeof s.language === "string") setLanguage(s.language);
      if (typeof s.context === "string") setContext(s.context);
      if (typeof s.result === "string") setResult(s.result);
      if (typeof s.verificationFeedback === "string") setVerificationFeedback(s.verificationFeedback);
      if (s.generationStatus) setGenerationStatus(s.generationStatus);
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
      figureAbortRef.current?.abort();
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

  const handleGenerate = async () => {
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

      // 统计之前章节已有图表数，按论文章节顺序编号（非写作顺序）
      const existingFigures = countProjectFigures(project, targetSectionKey);
      const figureStart = existingFigures + 1;

      const response = await fetch("/api/writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          section: targetSectionKey,
          context,
          language,
          template: project.template,
          existingReferences: project.references || [],
          researchDirection: project.researchDirection,
          retrievalMode,
          mode: fastMode ? "fast" : "full",
          subsectionTitle: subTitle,
          figureStart,
          globalContext: {
            abstract: project.abstract,
            outline: project.outline,
            sectionPreviews,
            analysisResults: project.analysisResults || []
          }
        }),
      });

      if (!response.ok) throw new Error("生成失败");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine === "data: [DONE]") continue;
            if (trimmedLine.startsWith("data:")) {
              try {
                const data = JSON.parse(trimmedLine.slice(5).trim());
                if (data.references && Array.isArray(data.references) && data.references.length > 0 && onUpdateProject) {
                  setDetectedRefs((prev) => Array.from(new Set([...prev, ...data.references])));
                  onUpdateProject({ references: data.references });
                }
                if (data.status) {
                  setGenerationStatus(data.status);
                  if (data.status === "writing") toast.info("AI 正在起草内容...");
                  else if (data.status === "verifying") toast.info("学术核查代理审计中...");
                  else if (data.status === "refining") toast.info("正在根据意见全自动修正终稿...");
                }
                if (data.action === "clear_result") setResult("");
                const content = data.choices?.[0]?.delta?.content || data.answer || "";
                if (content) {
                  // 流式期间直接累积原文（不做逐 chunk 的 FIGURE 正则匹配，避免跨 chunk 漏检）
                  setResult((prev) => { const next = prev + content; resultRef.current = next; return next; });
                }
                if (data.verification) setVerificationFeedback((prev) => prev + data.verification);
                if (data.citation_warnings) setCitationWarnings(data.citation_warnings);
                if (data.corrected_text) {
                  setResult(data.corrected_text);
                  resultRef.current = data.corrected_text;
                }
              } catch (e) {}
            }
          }
        }
      }

      // 流结束后：扫描完整结果文本中的 FIGURE 标记和插图占位
      const fullText = resultRef.current;

      // 工具函数：找到 【FIG***:{JSON}】 块（容错 FIGURE/FIGURA/FIGUER 等拼写变体）
      const findFigureBlocks = (text: string): { json: Record<string, unknown>; raw: string }[] => {
        const results: { json: Record<string, unknown>; raw: string }[] = [];
        // 匹配 【FIG 开头（不区分大小写），后跟任意字母，然后是 :{ 开始 JSON
        const blockRegex = /【FIG([A-Z]*):(\{)/gi;
        let match: RegExpExecArray | null;
        while ((match = blockRegex.exec(text)) !== null) {
          const jsonStart = match.index + match[0].length - 1; // 指向 {
          // 括号计数找到匹配的 }
          let depth = 0;
          let jsonEnd = -1;
          for (let i = jsonStart; i < text.length; i++) {
            if (text[i] === "{") depth++;
            else if (text[i] === "}") {
              depth--;
              if (depth === 0) { jsonEnd = i; break; }
            }
          }
          if (jsonEnd === -1) continue;
          // 检查后面是否紧跟 】
          if (text[jsonEnd + 1] !== "】") continue;
          const raw = text.slice(match.index, jsonEnd + 2);
          try {
            const json = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
            if (json.tool && json.config && json.caption) {
              results.push({ json, raw });
            }
          } catch {
            // JSON 解析失败，跳过
          }
        }
        return results;
      };

      // 1. 处理插图占位符（无数据 chart 的轻量标记）
      const placeholderRegex = /【插图占位：([^】]+)】/g;
      let phm: RegExpExecArray | null;
      let phText = fullText;
      let placeholderCount = 0;
      const phRegex = new RegExp(placeholderRegex.source, placeholderRegex.flags);
      while ((phm = phRegex.exec(fullText)) !== null) {
        const caption = phm[1].trim();
        if (caption) {
          phText = phText.replace(
            phm[0],
            `\n\n> 📊 **建议插图**：${caption}\n> *（此处为系统根据上下文自动标记的建议图位。请提供数据后点击重新生成，或手动替换为实际图表。）*\n\n`,
          );
          placeholderCount++;
        }
      }
      if (placeholderCount > 0) {
        setResult(phText);
        resultRef.current = phText;
      }

      // 2. 处理可执行 FIGURE 标记（用括号计数定位，支持嵌套 JSON）
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

      if (detectedFigures.length > 0) {
        setResult(processedText);
        resultRef.current = processedText;
        // 直接存 ref，彻底绕开 React state batch 时序问题
        detectedFiguresRef.current = detectedFigures;
        setPendingFigures(detectedFigures.map(f => ({ ...f, spec: "", status: "pending" as const })));

        setGenerationStatus("completed");
        toast.info(`正在自动生成 ${detectedFigures.length} 张配图...`);
        const _abort = new AbortController();
        figureAbortRef.current = _abort;
        (async () => {
          const _figs = detectedFiguresRef.current;
          for (let i = 0; i < _figs.length; i++) {
            if (_abort.signal.aborted) break;
            setPendingFigures(prev => prev.map((f, j) => j === i ? { ...f, status: "generating" } : f));
            try {
              const fig = _figs[i];
              if (!fig) continue;
              let imgUrl = "";
              const cfg = JSON.parse(fig.config);

              // 带超时的 fetch（12 秒，避免单张图卡死整个流程）
              const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs = 12000): Promise<Response> => {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                try {
                  return await fetch(url, { ...init, signal: controller.signal });
                } finally {
                  clearTimeout(timer);
                }
              };

              if (fig.tool === "chart") {
                const fd = new FormData();
                // 支持内联数据（Chart.js 风格）
                if (cfg.data?.labels && cfg.data?.datasets) {
                  const labels = cfg.data.labels as string[];
                  const datasets = cfg.data.datasets as Array<{ label?: string; data: number[] }>;
                  // 构建标准 CSV：第一列 X，后续列为各 dataset
                  let csv = "X," + labels.join(",") + "\n";
                  for (const ds of datasets) {
                    csv += (ds.label || "data") + "," + ds.data.join(",") + "\n";
                  }
                  fd.append("dataFile", new Blob([csv], { type: "text/csv" }), "data.csv");
                } else if (cfg.data_file) {
                  const resp = await fetch(cfg.data_file);
                  const blob = await resp.blob();
                  fd.append("dataFile", blob, "data.csv");
                }
                if (fd.has("dataFile")) {
                  fd.append("config", JSON.stringify({ title: fig.caption, chart_type: cfg.chart_type || cfg.type || "bar", data: cfg.data }));
                  const r = await fetchWithTimeout("/api/chart", { method: "POST", body: fd });
                  const j = await r.json();
                  imgUrl = j.imageUrl || "";
                }
              } else if (fig.tool === "xrd_peakfit" && cfg.data_file) {
                const fd = new FormData();
                const resp = await fetchWithTimeout(cfg.data_file, {});
                const blob = await resp.blob();
                fd.append("dataFile", blob, "data.csv");
                fd.append("config", JSON.stringify({ title: fig.caption, bg_params: {}, peak_params: { max_peaks: 15 } }));
                const r = await fetchWithTimeout("/api/xrd/peakfit", { method: "POST", body: fd });
                const j = await r.json();
                imgUrl = j.imageUrl || "";
              } else if (fig.tool === "flow") {
                console.log(`[FIGURE] Generating flow diagram: ${fig.caption}`);
                const r = await fetchWithTimeout("/api/flow-diagram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
                const j = await r.json();
                if (j.imageUrl) {
                  imgUrl = j.imageUrl;
                  console.log(`[FIGURE] Flow diagram OK: ${imgUrl}`);
                } else {
                  console.warn(`[FIGURE] Flow diagram failed: ${j.error || "unknown"}`);
                }
              } else if (fig.tool === "mechanism") {
                // 兼容旧版 mechanism token：转为 flow 格式
                const mechanismCfg = {
                  title: cfg.title || cfg.description || "反应机理",
                  direction: "vertical",
                  nodes: [{ id: "1", label: cfg.description?.slice(0, 20) || "机理过程" }, { id: "2", label: "产物" }],
                  edges: [{ from: "1", to: "2" }],
                };
                const r = await fetchWithTimeout("/api/flow-diagram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mechanismCfg) });
                const j = await r.json();
                imgUrl = j.imageUrl || "";
              }

              if (imgUrl) {
                const md = `\n\n![${fig.caption}](${imgUrl})\n\n`;
                setResult(prev => {
                  const next = prev.replace(`*[正在生成 ${fig.caption}...]*`, md);
                  resultRef.current = next;
                  return next;
                });
                setPendingFigures(prev => prev.map((f, j) => j === i ? { ...f, status: "done", imageUrl: imgUrl } : f));
              } else {
                // 失败时替换占位符为可读提示，避免残留 raw placeholder
                const fallback = `\n\n> 📊 **${fig.caption}**（未能自动生成，请手动补充图表）\n\n`;
                setResult(prev => {
                  const next = prev.replace(`*[正在生成 ${fig.caption}...]*`, fallback);
                  resultRef.current = next;
                  return next;
                });
                setPendingFigures(prev => prev.map((f, j) => j === i ? { ...f, status: "failed" } : f));
              }
            } catch {
              // 异常时同样替换占位符（用 _figs[i] 而非 pendingFigures，避免异步状态不一致）
              const caption = _figs[i]?.caption || "图表";
              const fallback = `\n\n> 📊 **${caption}**（生成异常，请手动补充）\n\n`;
              setResult(prev => {
                const next = prev.replace(`*[正在生成 ${caption}...]*`, fallback);
                resultRef.current = next;
                return next;
              });
              setPendingFigures(prev => prev.map((f, j) => j === i ? { ...f, status: "failed" } : f));
            }
          }
          toast.success("配图生成完成");
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
      toast.error(error instanceof Error ? error.message : "写作生成失败");
      setGenerationStatus("idle");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyToEditor = () => {
    const content = resultRef.current || result;
    if (onGenerate && content && targetSectionKey) {
      onGenerate(content, targetSectionKey, subsectionTitle);
      toast.success(`内容已应用到 ${targetSectionKey} 章节，可点击工具栏"引用重排"整理引用`);
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
                    const IMRAD_ORDER = ["abstract", "introduction", "methods", "results", "conclusion"];
                    const IMRAD_LABELS: Record<string, string> = {
                      abstract: "摘要 (Abstract)",
                      introduction: "引言 (Introduction)",
                      methods: "材料与方法 (Methods)",
                      results: "结果与讨论 (Results & Discussion)",
                      conclusion: "结论 (Conclusion)",
                    };
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
                    {DEFAULT_SECTIONS.map((s) => (
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
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={injectAnalysis} title="注入实验数据">
                  <Database className="h-3 w-3" />
                </Button>
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
            <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => {
              setContext(""); setResult(""); setSelectedSectionId("");
              setVerificationFeedback("");
              setDetectedRefs([]);
              setGenerationStatus("idle");
              try {
                sessionStorage.removeItem(writingSessionKey(projectId));
              } catch {
                /* ignore */
              }
            }}>
              <Eraser className="mr-1 h-3 w-3" /> 重置
            </Button>
            <Button size="sm" className="flex-[2] text-xs" onClick={handleGenerate} disabled={isGenerating || !selectedSectionId}>
              {isGenerating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
              {selectedSectionId ? "扩写选定章节" : "请先选择任务"}
            </Button>
          </CardFooter>
        </Card>

        {result && (
          <Card className="flex flex-col min-h-[300px] bg-primary/5 border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between py-3 border-b">
              <CardTitle className="text-sm font-bold">AI 生成内容</CardTitle>
              <div className="flex gap-1">
                <Button variant="default" size="sm" className="h-7 text-[10px]" onClick={handleApplyToEditor}>
                  应用到编辑器
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

              {generationStatus === "verifying" && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-md border border-blue-100 animate-pulse">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs font-medium">学术核查代理正在审计正文严谨性...</span>
                </div>
              )}

              {generationStatus === "refining" && (
                <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-md border border-green-100 animate-pulse">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs font-medium">核查意见已采纳，正在自动修正终稿内容...</span>
                </div>
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

              <div className="whitespace-pre-wrap leading-relaxed text-[11px]">
                {result}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
