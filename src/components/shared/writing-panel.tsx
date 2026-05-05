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
import { parseOutline, OutlineSection, cn } from "@/lib/utils";

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
  /** 工作台左侧「结构」里当前选中的论文章节，变化时同步「存储至章节」 */
  editorActiveSection?: string;
  onGenerate?: (content: string, section: string) => void;
  onUpdateProject?: (updates: Partial<ProjectData>) => void;
}

export function WritingPanel({
  projectId,
  project,
  editorActiveSection,
  onGenerate,
  onUpdateProject,
}: WritingPanelProps) {
  const [title, setTitle] = useState(project.title || "");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [targetSectionKey, setTargetSectionKey] = useState<string>("introduction");
  const [language, setLanguage] = useState("zh");
  const [context, setContext] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<"idle" | "writing" | "verifying" | "refining" | "completed">("idle");
  const [result, setResult] = useState("");
  const [verificationFeedback, setVerificationFeedback] = useState("");
  const [detectedRefs, setDetectedRefs] = useState<string[]>([]);
  const [citationWarnings, setCitationWarnings] = useState<{ num: number; overlap: number; context: string }[]>([]);

  const restoredRef = useRef(false);

  // 1. 解析大纲为结构化任务
  const [outlineTasks, setOutlineTasks] = useState<OutlineSection[]>([]);

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

  useEffect(() => {
    const loadOutline = async () => {
      // 优先使用当前 project 对象的 outline，如果没有则尝试从 store 获取最新值
      let currentOutline = project.outline;
      if (!currentOutline) {
        const latest = await projectStore.get(projectId);
        currentOutline = latest?.outline || "";
      }
      
      const parsed = parseOutline(currentOutline);
      
      // 兜底逻辑：如果解析不到任何章节，但大纲确实有内容，则将整篇大纲作为一个任务
      if (parsed.length === 0 && currentOutline.trim().length > 0) {
        setOutlineTasks([{
          id: "fallback-outline",
          title: "全篇大纲扩写任务",
          level: 1,
          content: currentOutline,
          fullPath: "大纲概览"
        }]);
      } else {
        setOutlineTasks(parsed);
      }
    };
    
    loadOutline();
  }, [project.outline, projectId]);

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
    return () => window.clearTimeout(t);
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

  const handleSelectTask = useCallback((task: OutlineSection) => {
    setSelectedSectionId(task.id);

    const titleLower = task.fullPath.toLowerCase();
    let bestKey = "introduction";
    if (titleLower.includes("摘要") || titleLower.includes("abstract")) bestKey = "abstract";
    else if (titleLower.includes("方法") || titleLower.includes("method")) bestKey = "methods";
    else if (titleLower.includes("结果") || titleLower.includes("讨论") || titleLower.includes("result")) bestKey = "results";
    else if (titleLower.includes("结论") || titleLower.includes("conclu")) bestKey = "conclusion";

    setTargetSectionKey(bestKey);

    const taskContext = `【章节标题】：${task.fullPath}\n【写作要求】：\n${task.content || "请根据标题展开学术论述。"}`;
    setContext(taskContext);
  }, []);

  // 3. 自动选中逻辑：如果列表刷新且当前未选中，则自动选中第一个有效任务
  useEffect(() => {
    if (outlineTasks.length > 0 && !selectedSectionId) {
      handleSelectTask(outlineTasks[0]);
    }
  }, [outlineTasks, selectedSectionId, handleSelectTask]);

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
          globalContext: {
            abstract: project.abstract,
            outline: project.outline,
            sectionPreviews
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
                  else if (data.status === "verifying") toast.info("学术核核代理审计中...");
                  else if (data.status === "refining") toast.info("正在根据意见全自动修正终稿...");
                }
                if (data.action === "clear_result") setResult("");
                const content = data.choices?.[0]?.delta?.content || data.answer || "";
                if (content) setResult((prev) => prev + content);
                if (data.verification) setVerificationFeedback((prev) => prev + data.verification);
                if (data.citation_warnings) setCitationWarnings(data.citation_warnings);
              } catch (e) {}
            }
          }
        }
      }
      setGenerationStatus("completed");
    } catch (error: any) {
      toast.error(error.message);
      setGenerationStatus("idle");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyToEditor = () => {
    if (onGenerate && result && targetSectionKey) {
      onGenerate(result, targetSectionKey);
      toast.success(`内容已应用到 ${targetSectionKey} 章节`);
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

            {/* 大纲任务列表 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">选择大纲任务</Label>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-5 w-5 text-muted-foreground hover:text-primary"
                  onClick={async () => {
                    // 强制从存储中重新读取大纲
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
              <div className="border rounded-md max-h-[200px] overflow-y-auto bg-muted/20">
                {outlineTasks.length > 0 ? (
                  <div className="divide-y">
                    {outlineTasks.map((task) => (
                      <div 
                        key={task.id}
                        onClick={() => handleSelectTask(task)}
                        className={cn(
                          "flex items-center justify-between p-2 cursor-pointer transition-colors hover:bg-primary/10",
                          selectedSectionId === task.id ? "bg-primary/15 border-l-2 border-primary" : "",
                          task.level === 1 ? "font-bold" : "pl-6 text-[11px]"
                        )}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="text-[10px] text-muted-foreground shrink-0">{task.level === 1 ? "H1" : "H2"}</span>
                          <span className="truncate">{task.title}</span>
                        </div>
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-muted-foreground italic">
                    请先生成论文大纲
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">存储至章节（随左侧结构同步，可改）</Label>
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
                <Label className="text-xs">输出语言</Label>
                <Select onValueChange={(val) => setLanguage(val || "zh")} value={language}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue placeholder="语言" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh" className="text-xs">中文</SelectItem>
                    <SelectItem value="en" className="text-xs">英文</SelectItem>
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
