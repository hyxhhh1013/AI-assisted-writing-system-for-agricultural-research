"use client";

import { useState, useEffect, Suspense, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { mergeEditorIntoProject } from "@/lib/export-content";
import { ensureSubsectionNumbering } from "@/lib/academic-numbering";
import { useDocxExport } from "@/hooks/use-docx-export";
import { useReferenceReorder } from "@/hooks/use-reference-reorder";
import { useEditorSync } from "@/hooks/use-editor-sync";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useMarkdownExport } from "@/hooks/use-markdown-export";
import { usePdfExport } from "@/hooks/use-pdf-export";
import {
  ArrowLeft, Save, Loader2,
  FileText, Layout, BookOpen,
  CheckCircle2, ChevronLeft, ChevronRight,
  Eye, FileSearch, Settings2,
  BarChart3, Search, Radar
} from "lucide-react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { projectStore, ProjectData } from "@/lib/store";
import SCIPreview from "@/components/sci-preview";
import {
  ResizableHandle, 
  ResizablePanel, 
  ResizablePanelGroup 
} from "@/components/ui/resizable";
import { AnalysisPanel } from "@/components/shared/analysis-panel";
import { OutlinePanel } from "@/components/shared/outline-panel";
import { WritingPanel } from "@/components/shared/writing-panel";
import { ReaderPanel } from "@/components/shared/reader-panel";
import { PlagiarismPanel } from "@/components/shared/plagiarism-panel";
import { XrdPanel } from "@/components/shared/xrd-panel";
import { EditorImageGallery } from "@/components/shared/editor-image-gallery";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import { ReferenceBrowser } from "@/components/shared/reference-browser";
import { WorkbenchMetaDialog } from "@/components/shared/workbench-meta-dialog";
import { WorkbenchConsistencyDialog } from "@/components/shared/workbench-consistency-dialog";
import { WorkbenchEditorArea } from "@/components/shared/workbench-editor-area";

const PDFViewer = dynamic(() => import("@/components/pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  ),
});

const SECTIONS = [
  { id: "abstract", label: "Abstract", placeholder: "摘要内容..." },
  { id: "introduction", label: "1. Introduction", placeholder: "引言部分..." },
  { id: "methods", label: "2. Materials and Methods", placeholder: "材料与方法..." },
  { id: "results", label: "3. Results and Discussion", placeholder: "结果与讨论..." },
  { id: "conclusion", label: "4. Conclusion", placeholder: "结论部分..." },
];

type WorkbenchTab = "structure" | "analysis" | "outline" | "writing" | "reader" | "plagiarism" | "xrd";

const WORKBENCH_TABS: WorkbenchTab[] = [
  "structure",
  "analysis",
  "outline",
  "writing",
  "reader",
  "plagiarism",
  "xrd",
];

const isWorkbenchTab = (value: string | null): value is WorkbenchTab =>
  value !== null && WORKBENCH_TABS.includes(value as WorkbenchTab);

export default function WorkbenchPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">正在加载工作台...</div>}>
      <WorkbenchContent />
    </Suspense>
  );
}

function WorkbenchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");
  
  const [project, setProject] = useState<ProjectData>(projectStore.getDefault());
  const [activeSection, setActiveSection] = useState("introduction");
  const [editingContent, setEditingContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [language, setLanguage] = useState("zh");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("structure");
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);
  const [rightPanelMode, setRightPanelMode] = useState<"preview" | "reader">("preview");
  const [editorMode, setEditorMode] = useState<"classic" | "paragraph">("classic");
  const [currentPdf, setCurrentPdf] = useState<string | null>(null);
  const [isWritingGenerating, setIsWritingGenerating] = useState(false);
  const [isMetaDialogOpen, setIsMetaDialogOpen] = useState(false);
  const [isConsistencyOpen, setIsConsistencyOpen] = useState(false);
  const [expandedOutlineSections, setExpandedOutlineSections] = useState<string[]>([]);
  const [pendingExpandTask, setPendingExpandTask] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  // 使用 ref 存储最新值，避免 setTimeout/stale closure 中读到旧状态
  const projectRef = useRef(project);
  projectRef.current = project;
  const editingContentRef = useRef(editingContent);
  editingContentRef.current = editingContent;
  const activeSectionRef = useRef(activeSection);
  activeSectionRef.current = activeSection;

  const previewProject = useMemo<ProjectData>(() => {
    return mergeEditorIntoProject(project, activeSection, editingContent);
  }, [project, activeSection, editingContent]);

  useEffect(() => {
    const initProject = async () => {
      if (!projectId) {
        const lastId = projectStore.getCurrentId();
        if (lastId) {
          router.replace(`/workbench?id=${lastId}${searchParams.get("tab") ? `&tab=${searchParams.get("tab")}` : ""}`);
        } else {
          router.replace("/projects");
        }
        return;
      }

      const data = await projectStore.get(projectId);
      if (data) {
        setProject(data);
        setEditingContent(data.sections[activeSection] || "");
        if (data.expandedOutlineSections) {
          setExpandedOutlineSections(data.expandedOutlineSections);
        }

        // 根据 URL 参数设置初始 Tab
        const tab = searchParams.get("tab");
        if (isWorkbenchTab(tab)) {
          setActiveTab(tab);
        }
      } else {
        toast.error("未找到项目数据，正在返回列表");
        router.replace("/projects");
      }
    };

    initProject();
  }, [projectId]);

  // 当切换章节时同步内容
  useEffect(() => {
    if (activeSection === "abstract") {
      setEditingContent(project.abstract || "");
    } else if (project.sections[activeSection] !== undefined) {
      setEditingContent(project.sections[activeSection]);
    } else {
      setEditingContent("");
    }
  }, [activeSection, project.id, project.abstract]); // 增加 project.abstract 监听

  // 核心优化：实时将编辑内容同步到 project 状态（提取至 useEditorSync）
  useEditorSync(editingContent, activeSection, setProject, projectRef);

  const handleSave = async () => {
    // 始终使用当前内存中的 project 状态，确保摘要和各章节都能正确更新
    const updatedProject = mergeEditorIntoProject(project, activeSection, editingContent);
    setProject(updatedProject);
    await projectStore.save(updatedProject);
    toast.success("项目已保存到云端");
  };

  // 自动保存（提取至 useAutoSave）
  useAutoSave(project, projectId);

  // 将 expandedOutlineSections 同步到 project state（以便自动保存）
  useEffect(() => {
    setProject(prev => {
      if (!prev) return prev;
      if (prev.expandedOutlineSections === expandedOutlineSections) return prev;
      return { ...prev, expandedOutlineSections };
    });
  }, [expandedOutlineSections]);

  const handleApplyAiContent = (content: string, sectionId: string, subsectionTitle?: string) => {
    let processedContent = content;
    if (sectionId === "results" || sectionId === "conclusion") {
      const currentProject = projectRef.current;
      const existingText = currentProject?.sections?.[sectionId] || "";
      processedContent = ensureSubsectionNumbering(content, sectionId, existingText);
    }

    // 子任务扩写：合并到现有章节内容中，而非覆盖
    if (subsectionTitle) {
      const currentProject = projectRef.current;
      const existingText = sectionId === "abstract"
        ? (currentProject?.abstract || "")
        : (currentProject?.sections?.[sectionId] || "");

      // 尝试在现有内容中定位该子节并替换；若找不到则追加
      const escapedTitle = subsectionTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const headingPattern = new RegExp(
        `(?:^|\\n)([#]*\\s*)?(?:\\d+\\.?\\d*\\.?\\s*)?${escapedTitle}\\s*\\n`,
        "i"
      );
      const match = existingText.match(headingPattern);

      let merged: string;
      if (match && match.index !== undefined) {
        // 找到该子节 → 替换到下一个同级/上级标题前
        const startIdx = match.index! + match[0].length;
        const afterMatch = existingText.slice(startIdx);
        const nextHeadingMatch = afterMatch.match(/\n(?:#+ |\d+\.\d*\s|#{1,3}\s)/);
        const endIdx = nextHeadingMatch
          ? startIdx + nextHeadingMatch.index!
          : existingText.length;
        merged = existingText.slice(0, match.index! + match[0].length) + processedContent + "\n\n" + existingText.slice(endIdx);
      } else {
        // 未找到 → 追加到章节末尾
        const heading = `### ${subsectionTitle}`;
        merged = existingText
          ? `${existingText}\n\n${heading}\n${processedContent}`
          : `${heading}\n${processedContent}`;
      }

      processedContent = merged;
    }

    setProject(prev => {
      if (!prev) return prev;
      if (sectionId === "abstract") {
        return { ...prev, abstract: processedContent };
      }
      return { ...prev, sections: { ...prev.sections, [sectionId]: processedContent } };
    });
    setEditingContent(processedContent);
    if (sectionId !== activeSection) {
      setActiveSection(sectionId);
    }
    toast.success(`内容已应用到 ${sectionId} 章节`);
  };

  const handleOpenFile = (fileName: string) => {
    setCurrentPdf(fileName);
    setRightPanelMode("reader");
    setIsPreviewOpen(true);
  };

  const handleSaveMeta = async (draft: { title: string; authors: string; affiliations: string; abstract: string; keywords: string; classification: string; researchDirection: string; outline: string; template: string; referencesText: string }) => {
    const updated: ProjectData = {
      ...project,
      title: draft.title,
      authors: draft.authors,
      affiliations: draft.affiliations,
      abstract: draft.abstract,
      keywords: draft.keywords,
      classification: draft.classification,
      researchDirection: draft.researchDirection,
      outline: draft.outline,
      template: draft.template,
      references: draft.referencesText.split(/\n+/).map((ref) => ref.trim()).filter(Boolean),
    };
    setProject(updated);
    await projectStore.save(updated);
    setIsMetaDialogOpen(false);
    toast.success("项目信息已更新");
  };

  const handleReorderReferences = useReferenceReorder({
    projectRef, editingContentRef, activeSectionRef, setProject, setEditingContent,
  });

  /**
   * 处理单个段落的 AI 扩写
   */
  const handleExpandParagraph = async (paragraphContent: string) => {
    if (!project || !activeSection) return "";

    try {
      const response = await fetch("/api/writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: project.title,
          section: activeSection,
          context: paragraphContent,
          language: "zh",
          template: project.template,
          existingReferences: project.references || [],
          researchDirection: project.researchDirection
        }),
      });

      if (!response.ok) throw new Error("扩写失败");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
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
                const data = JSON.parse(trimmedLine.slice(5));
                if (data.references && Array.isArray(data.references) && data.references.length > 0) {
                  // 同步新文献
                  setProject(prev => ({
                    ...prev,
                    references: Array.from(new Set([...(prev.references || []), ...data.references]))
                  }));
                }
                const content = data.choices?.[0]?.delta?.content || "";
                fullText += content;
              } catch (e) {}
            }
          }
        }
      }
      return fullText;
    } catch (error) {
      console.error("Expand Error:", error);
      throw error;
    }
  };

  /**
   * 处理单个段落的 AI 审查
   */
  const handleAuditParagraph = async (paragraphContent: string) => {
    if (!project || !activeSection) return "";

    try {
      const response = await fetch("/api/writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: project.title,
          section: activeSection,
          context: paragraphContent,
          language: "zh",
          template: project.template,
          existingReferences: project.references || [],
          researchDirection: project.researchDirection,
          mode: "audit_only"
        }),
      });

      if (!response.ok) throw new Error("审查失败");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let auditReport = "";
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
                const data = JSON.parse(trimmedLine.slice(5));
                if (data.verification) {
                  auditReport += data.verification;
                }
              } catch (e) {
                console.error("Parse Error:", e);
              }
            }
          }
        }
      }
      return auditReport;
    } catch (error) {
      console.error("Audit Error:", error);
      throw error;
    }
  };

  /**
   * 处理单个段落的 AI 自动修正
   */
  const handleFixParagraph = async (paragraphContent: string, feedback: string) => {
    if (!project || !activeSection) return "";

    try {
      const response = await fetch("/api/writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: project.title,
          section: activeSection,
          context: paragraphContent,
          language: "zh",
          template: project.template,
          existingReferences: project.references || [],
          mode: "fix_only", // 新增模式，直接根据意见修正
          verificationFeedback: feedback
        }),
      });

      if (!response.ok) throw new Error("修正失败");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fixedText = "";
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
                const data = JSON.parse(trimmedLine.slice(5));
                const content = data.choices?.[0]?.delta?.content || data.answer || "";
                if (content) fixedText += content;
              } catch (e) {
                console.error("Parse Error:", e);
              }
            }
          }
        }
      }
      return fixedText;
    } catch (error) {
      console.error("Fix Error:", error);
      throw error;
    }
  };

  const handleExportDoc = useDocxExport({
    project, activeSection, editingContent, saveProject: handleSave,
  });

  const handleExportMarkdown = useMarkdownExport(project, activeSection, editingContent);
  const handleExportPDF = usePdfExport(project, activeSection, editingContent);


  return (
    <ErrorBoundary>
    <div className="flex h-screen bg-background overflow-hidden relative">
      {/* Far Left: Tab Switcher */}
      <div className="w-14 border-r bg-card flex flex-col items-center py-4 gap-4 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.push("/projects")} title="返回项目列表">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 flex flex-col gap-2">
          <Button 
            variant={activeTab === "structure" ? "default" : "ghost"} 
            size="icon" 
            onClick={() => setActiveTab("structure")}
            title="IMRaD 章节：摘要 / 引言 / 方法 / 结果 / 结论"
          >
            <Layout className="h-5 w-5" />
          </Button>
          <Button
            variant={activeTab === "analysis" ? "default" : "ghost"}
            size="icon"
            onClick={() => setActiveTab("analysis")}
            title="实验数据摘要与趋势描述"
          >
            <BarChart3 className="h-5 w-5" />
          </Button>
          <Button
            variant={activeTab === "xrd" ? "default" : "ghost"}
            size="icon"
            onClick={() => setActiveTab("xrd")}
            title="XRD 分析：峰分解 / 背景扣除 / 晶胞可视化"
          >
            <Radar className="h-5 w-5" />
          </Button>
          <Button
            variant={activeTab === "outline" ? "default" : "ghost"}
            size="icon"
            onClick={() => setActiveTab("outline")}
            title="论证提纲：AI 生成目录树（与左侧 IMRaD 并列，非同一套）"
          >
            <BookOpen className="h-5 w-5" />
          </Button>
          <Button
            variant={activeTab === "writing" ? "default" : "ghost"}
            size="icon"
            onClick={() => setActiveTab("writing")}
            title="侧栏整章扩写（RAG + 多阶段），应用后写入所选章"
            className={cn(isWritingGenerating && activeTab !== "writing" && "ring-2 ring-primary animate-pulse")}
          >
            <FileText className={cn("h-5 w-5", isWritingGenerating && "text-primary")} />
          </Button>
          <Button 
            variant={activeTab === "reader" ? "default" : "ghost"} 
            size="icon" 
            onClick={() => {
              setActiveTab("reader");
              setRightPanelMode("reader");
              setIsPreviewOpen(true);
            }}
            title="本地文献库 PDF"
          >
            <FileSearch className="h-5 w-5" />
          </Button>
          <Button
            variant={activeTab === "plagiarism" ? "default" : "ghost"}
            size="icon"
            onClick={() => setActiveTab("plagiarism")}
            title="论文查重与 AI 降重"
          >
            <Search className="h-5 w-5" />
          </Button>
        </div>
        <Button variant="ghost" size="icon"
          onClick={() => router.push(`/plot?id=${projectId}`)}
          title="数据绘图—分组柱状图、堆积图、折线图、三线表"
        >
          <BarChart3 className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleSave} title="保存项目">
          <Save className="h-5 w-5" />
        </Button>
      </div>

      {/* Second Left: Dynamic Panel */}
      <div 
        className={`bg-card border-r flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${
          isSidebarOpen ? "w-80" : "w-0"
        }`}
      >
        <div className="flex flex-col h-full w-80">
          <header className="h-14 border-b flex items-center justify-between px-4 shrink-0">
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm uppercase tracking-wider text-muted-foreground truncate">
                {activeTab === "structure" && "IMRaD 章节"}
                {activeTab === "analysis" && "数据分析"}
                {activeTab === "outline" && "论证提纲"}
                {activeTab === "writing" && "侧栏扩写"}
                {activeTab === "reader" && "文献库"}
                {activeTab === "plagiarism" && "查重与降重"}
                {activeTab === "xrd" && "XRD 分析"}
              </span>
              {activeTab === "structure" && (
                <span className="text-[10px] text-muted-foreground font-normal normal-case leading-tight mt-0.5 line-clamp-2">
                  与「论证提纲」并列：此处管五段正文；Outline 页管 AI 目录树。
                </span>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsSidebarOpen(false)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </header>
          
          <div className="flex-1 overflow-hidden p-4">
            {activeTab === "structure" && (
              <div className="h-full overflow-y-auto pr-2 custom-scrollbar space-y-1">
                <p className="text-[10px] text-muted-foreground px-1 pb-2 border-b mb-2 leading-relaxed">
                  点选章节后，中间编辑器与预览对应该段；引用重排会扫描<strong>含当前编辑区</strong>的全文。
                </p>
                {SECTIONS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center justify-between group ${
                      activeSection === s.id 
                        ? "bg-primary text-primary-foreground shadow-md" 
                        : "hover:bg-muted"
                    }`}
                  >
                    <span className="truncate font-medium">{s.label}</span>
                    {project.sections[s.id] && (
                      <CheckCircle2 className={`h-3.5 w-3.5 ml-2 ${activeSection === s.id ? "text-primary-foreground" : "text-green-500"}`} />
                    )}
                  </button>
                ))}

                <div className="pt-4 mt-4 border-t">
                  <ReferenceBrowser
                    references={project.references || []}
                    activeSectionContent={
                      activeSection === "abstract"
                        ? project.abstract
                        : project.sections[activeSection]
                    }
                    allContents={{
                      abstract: project.abstract || "",
                      introduction: project.sections.introduction || "",
                      methods: project.sections.methods || "",
                      results: project.sections.results || "",
                      conclusion: project.sections.conclusion || "",
                    }}
                  />
                </div>

                <div className="pt-4 mt-4 border-t space-y-4">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Title</Label>
                    <Input 
                      className="h-8 text-xs bg-muted/30 border-none" 
                      value={project.title} 
                      onChange={e => setProject({...project, title: e.target.value})}
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="w-full h-9 text-xs gap-2"
                    onClick={() => setIsMetaDialogOpen(true)}
                  >
                    <Settings2 className="h-3.5 w-3.5" /> 更多项目设置
                  </Button>
                </div>
              </div>
            )}
            {/* 所有面板保持挂载，切换不销毁状态 */}
            {projectId && (
              <div className={cn("h-full min-h-0 flex flex-col overflow-hidden", activeTab !== "analysis" && "hidden")}>
                <AnalysisPanel
                  projectId={projectId}
                  project={project}
                  onSave={(updates) => setProject(prev => ({ ...prev, ...updates }))}
                  onInsertToPaper={(imageUrl, caption) => {
                    const mdImage = `\n\n![${caption}](${imageUrl})\n\n`;
                    handleApplyAiContent(editingContent + mdImage, activeSection);
                  }}
                />
              </div>
            )}
            {projectId && (
              <div className={cn("h-full min-h-0 flex flex-col overflow-hidden", activeTab !== "outline" && "hidden")}>
                <OutlinePanel
                  projectId={projectId}
                  project={project}
                  expandedSections={expandedOutlineSections}
                  onExpandTask={(taskId: string) => {
                    setPendingExpandTask(taskId);
                    setActiveTab("writing");
                  }}
                  onSave={(updates) => {
                    setProject(prev => {
                      const next = { ...prev, ...updates };
                      projectStore.save(next).catch(() => {});
                      return next;
                    });
                  }}
                  onTabChange={setActiveTab}
                />
              </div>
            )}
            {/* 保持挂载：切换侧栏标签时扩写流与状态不丢失（仅隐藏，不卸载） */}
            {projectId && (
              <div
                className={cn(
                  "h-full min-h-0 flex flex-col overflow-hidden",
                  activeTab !== "writing" && "hidden",
                )}
              >
                <WritingPanel
                  projectId={projectId}
                  project={project}
                  editorActiveSection={activeSection}
                  preselectedTaskId={pendingExpandTask}
                  expandedSections={expandedOutlineSections}
                  onTaskExpanded={(taskId: string) => {
                    setExpandedOutlineSections(prev => {
                      if (prev.includes(taskId)) return prev;
                      return [...prev, taskId];
                    });
                  }}
                  onClearPreselected={() => setPendingExpandTask(null)}
                  onGenerate={handleApplyAiContent}
                  onGeneratingChange={setIsWritingGenerating}
                  onUpdateProject={(updates) => {
                    setProject((prev) => {
                      if (!prev) return prev;

                      const next = { ...prev, ...updates };

                      if (updates.references && Array.isArray(updates.references)) {
                        const existingRefs = prev.references || [];
                        const newRefs = updates.references;
                        const mergedRefs = Array.from(new Set([...existingRefs, ...newRefs]));
                        next.references = mergedRefs;
                      }

                      return next;
                    });
                  }}
                />
              </div>
            )}
            <div className={cn("h-full min-h-0 flex flex-col overflow-hidden", activeTab !== "reader" && "hidden")}>
              <ReaderPanel onOpenFile={handleOpenFile} />
            </div>
            <div className={cn("h-full min-h-0 flex flex-col overflow-hidden", activeTab !== "plagiarism" && "hidden")}>
              <PlagiarismPanel
                projectId={projectId ?? undefined}
                projectTitle={project.title}
              />
            </div>
            {projectId && (
              <div className={cn("h-full min-h-0 flex flex-col overflow-hidden", activeTab !== "xrd" && "hidden")}>
                <XrdPanel
                  projectId={projectId}
                  activeSection={activeSection}
                  onInsertToPaper={(imageBase64, caption) => {
                    const mdImage = `\n\n![${caption}](${imageBase64})\n\n`;
                    handleApplyAiContent(editingContent + mdImage, activeSection);
                    toast.success(`图表「${caption}」已插入到 ${activeSection} 章节`);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {!isSidebarOpen && (
        <Button 
          variant="secondary" 
          size="icon" 
          className="absolute left-14 top-1/2 -translate-y-1/2 rounded-l-none border shadow-md z-50 h-10 w-6 p-0"
          onClick={() => setIsSidebarOpen(true)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}

      {/* Main Area: Editor + Preview */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel defaultSize={60} minSize={30}>
          <WorkbenchEditorArea
            project={previewProject}
            activeSection={activeSection}
            editingContent={editingContent}
            editorMode={editorMode}
            rightPanelMode={rightPanelMode}
            onContentChange={setEditingContent}
            onEditorModeChange={setEditorMode}
            onRightPanelModeChange={(mode) => { setRightPanelMode(mode); setIsPreviewOpen(true); }}
            onOpenMetaDialog={() => setIsMetaDialogOpen(true)}
            onConsistencyCheck={() => { setIsConsistencyOpen(true); }}
            onReorderReferences={handleReorderReferences}
            onExportDoc={handleExportDoc}
            onExportMarkdown={handleExportMarkdown}
            onExportPDF={handleExportPDF}
            onExpandParagraph={handleExpandParagraph}
            onAuditParagraph={handleAuditParagraph}
            onFixParagraph={handleFixParagraph}
            projectId={projectId || "default"}
          />
        </ResizablePanel>

        {isPreviewOpen && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={40} minSize={20}>
              <div className="bg-card flex flex-col h-full overflow-hidden border-l">
                <header className="h-14 border-b bg-card flex items-center px-6 shrink-0 justify-between">
                  <span className="font-bold text-sm flex items-center gap-2">
                    {rightPanelMode === "preview" ? (
                      <><Eye className="h-4 w-4 text-primary shrink-0" /><span className="truncate max-w-[200px]">{project.title || "未命名论文"}</span></>
                    ) : (
                      <><FileSearch className="h-4 w-4 text-primary" /> 文献详情</>
                    )}
                  </span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsPreviewOpen(false)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </header>
                <div className="flex-1 overflow-hidden relative">
                  {rightPanelMode === "preview" ? (
                    <ScrollArea className="h-full bg-muted/20 p-8 no-print">
                      <div className="max-w-[210mm] mx-auto shadow-2xl rounded-sm bg-white mb-10" ref={previewRef}>
                        <div className="print-container">
                          <SCIPreview project={previewProject} />
                        </div>
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="h-full">
                      {currentPdf ? (
                        <PDFViewer fileUrl={`/api/pdf?file=${encodeURIComponent(currentPdf)}`} />
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground italic p-8 text-center">
                          <Search className="h-12 w-12 mb-4 opacity-10" />
                          <p>在左侧文献库中选择一篇文献进行阅读</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* Meta Settings Dialog */}
      <WorkbenchMetaDialog
        open={isMetaDialogOpen}
        onClose={() => setIsMetaDialogOpen(false)}
        project={previewProject}
        onSave={handleSaveMeta}
      />

      {/* Consistency Check Dialog */}
      <WorkbenchConsistencyDialog
        open={isConsistencyOpen}
        onClose={() => setIsConsistencyOpen(false)}
        project={project}
        activeSection={activeSection}
        editingContent={editingContent}
      />
    </div>
    </ErrorBoundary>
  );
}
