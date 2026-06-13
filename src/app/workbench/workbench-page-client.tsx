"use client";

import { useState, useEffect, Suspense, useRef, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildWorkbenchSectionsForMode } from "@/lib/section-registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cleanDraftArtifacts, deduplicateParagraphs, cleanMarkdownArtifacts } from "@/lib/utils";
import { mergeEditorIntoProject, buildPlagiarismContentFromProject } from "@/lib/export-content";
import { ensureSubsectionNumbering, majorNumberFromSectionId, maxSecondLevelInText } from "@/lib/academic-numbering";
import { useDocxExport } from "@/hooks/use-docx-export";
import { useReferenceReorder } from "@/hooks/use-reference-reorder";
import { pruneUncitedReferences, collectAllCitedIndices, stripOutOfRangeCitations, remapPrunedCitations } from "@/lib/reference-reorder";
import { normalizeAllCitationFormats } from "@/lib/citation-bounds";
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
import { projectStore } from "@/lib/store";
import type { ProjectData } from "@/contracts/project";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from "@/components/ui/resizable";
import { EditorImageGallery } from "@/components/shared/editor-image-gallery";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import { ReferenceBrowser } from "@/components/shared/reference-browser";
import { WorkbenchTabSwitcher } from "@/components/shared/workbench-tab-switcher";
import { useAiParagraph, type AiParagraphAction } from "@/hooks/use-ai-paragraph";
import type { ParagraphSelectionAction } from "@/components/shared/writing/paragraph-selection-toolbar";
import { WorkbenchEditorArea } from "@/components/shared/workbench-editor-area";
import { ProjectModeBadge } from "@/components/shared/project-mode-badge";
import { getModeAccent, getStructurePanelTitle, getStructurePanelHint } from "@/lib/mode-theme";
import { siteTheme } from "@/lib/site-theme";
import { cn } from "@/lib/utils";
import { getProjectWritingMode } from "@/lib/section-registry";

// === Lazy-loaded panels: 首屏不加载，仅在对应 tab 激活时按需加载 ===

function TabPanelLoading() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-8 animate-pulse">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
      <div className="space-y-2 w-full">
        <div className="h-3 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-1/2" />
        <div className="h-3 bg-muted rounded w-2/3" />
      </div>
    </div>
  );
}

function PreviewLoading() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

const SCIPreview = dynamic(() => import("@/components/sci-preview"), {
  ssr: false, loading: () => <PreviewLoading />,
});

const WorkbenchMetaDialog = dynamic(
  () => import("@/components/shared/workbench-meta-dialog").then(m => m.WorkbenchMetaDialog),
  { ssr: false, loading: () => null }
);

const WorkbenchConsistencyDialog = dynamic(
  () => import("@/components/shared/workbench-consistency-dialog").then(m => m.WorkbenchConsistencyDialog),
  { ssr: false, loading: () => null }
);

const LazyDataPanel = dynamic(
  () => import("@/components/shared/data-panel").then(m => m.DataPanel),
  { ssr: false, loading: () => <TabPanelLoading /> }
);

const LazyOutlinePanel = dynamic(
  () => import("@/components/shared/outline-panel").then(m => m.OutlinePanel),
  { ssr: false, loading: () => <TabPanelLoading /> }
);

const LazyWritingPanel = dynamic(
  () => import("@/components/shared/writing-panel").then(m => m.WritingPanel),
  { ssr: false, loading: () => <TabPanelLoading /> }
);

const LazyReaderPanel = dynamic(
  () => import("@/components/shared/reader-panel").then(m => m.ReaderPanel),
  { ssr: false, loading: () => <TabPanelLoading /> }
);

const LazyPlagiarismPanel = dynamic(
  () => import("@/components/shared/plagiarism-panel").then(m => m.PlagiarismPanel),
  { ssr: false, loading: () => <TabPanelLoading /> }
);

const LazyXrdPanel = dynamic(
  () => import("@/components/shared/xrd-panel").then(m => m.XrdPanel),
  { ssr: false, loading: () => <TabPanelLoading /> }
);
const PDFViewer = dynamic(() => import("@/components/pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  ),
});

export type WorkbenchTab = "structure" | "data" | "outline" | "writing" | "reader" | "plagiarism" | "xrd";

const WORKBENCH_TABS: WorkbenchTab[] = [
  "structure",
  "data",
  "outline",
  "writing",
  "reader",
  "plagiarism",
  "xrd",
];

const isWorkbenchTab = (value: string | null): value is WorkbenchTab =>
  value !== null && WORKBENCH_TABS.includes(value as WorkbenchTab);

const EDITOR_MODE_STORAGE_KEY = "grainscript_editor_mode";

function readStoredEditorMode(): "classic" | "paragraph" {
  if (typeof window === "undefined") return "paragraph";
  const stored = localStorage.getItem(EDITOR_MODE_STORAGE_KEY);
  return stored === "classic" || stored === "paragraph" ? stored : "paragraph";
}

export default function WorkbenchPageClient() {
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("structure");
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);
  const [rightPanelMode, setRightPanelMode] = useState<"preview" | "reader">("preview");
  const [editorMode, setEditorMode] = useState<"classic" | "paragraph">("paragraph");
  const [currentPdf, setCurrentPdf] = useState<string | null>(null);
  const [isWritingGenerating, setIsWritingGenerating] = useState(false);
  const [aiPreview, setAiPreview] = useState<{
    content: string;
    pipelineSteps: import("@/hooks/use-writing-stream").PipelineStep[];
    verification: string;
    citationWarnings: { num: number; overlap: number; context: string }[];
    dataClaimWarnings: { claimId: string; claimText: string; found: boolean; citedCorrectly: boolean; issue?: string }[];
    detectedRefs: string[];
    isStreaming: boolean;
    targetSection: string;
    subsectionTitle?: string;
  } | null>(null);
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

  const structureSections = useMemo(
    () => buildWorkbenchSectionsForMode(project.mode ?? "review", "zh"),
    [project.mode],
  );

  const writingMode = getProjectWritingMode(project.mode);
  const modeAccent = useMemo(() => getModeAccent(writingMode), [writingMode]);

  const sectionContentsForRefs = useMemo(() => {
    const base: Record<string, string> = { abstract: project.abstract || "" };
    for (const [key, content] of Object.entries(project.sections || {})) {
      base[key] = content || "";
    }
    return base;
  }, [project.abstract, project.sections]);

  const previewProject = useMemo<ProjectData>(() => {
    return mergeEditorIntoProject(project, activeSection, editingContent);
  }, [project, activeSection, editingContent]);

  useEffect(() => {
    if (project.mode !== "research" && activeTab === "data") {
      setActiveTab("structure");
    }
  }, [project.mode, activeTab]);

  useEffect(() => {
    setEditorMode(readStoredEditorMode());
  }, []);

  useEffect(() => {
    localStorage.setItem(EDITOR_MODE_STORAGE_KEY, editorMode);
  }, [editorMode]);

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
        if (tab === "analysis" || tab === "evidence") {
          setActiveTab("data");
        } else if (isWorkbenchTab(tab)) {
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

  const handleSave = useCallback(async () => {
    const updatedProject = mergeEditorIntoProject(projectRef.current, activeSectionRef.current, editingContentRef.current);
    await projectStore.save(updatedProject);
    setProject(updatedProject);
    toast.success("项目已保存到云端");
  }, []);

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

  const focusEditorAfterDraft = useCallback((sectionId: string) => {
    setEditorMode("paragraph");
    setActiveSection(sectionId);
    setActiveTab("structure");
    setAiPreview(null);
  }, []);

  const handleApplyAiContent = (content: string, sectionId: string, subsectionTitle?: string) => {
    const currentProject = projectRef.current;
    const existingText = sectionId === "abstract"
      ? (currentProject?.abstract || "")
      : (currentProject?.sections?.[sectionId] || "");

    // 统一标题格式：所有 body section（非 abstract）都走 ensureSubsectionNumbering
    let processedContent = content;
    const isBodySection = sectionId !== "abstract";
    if (isBodySection) {
      processedContent = ensureSubsectionNumbering(processedContent, sectionId, existingText);
    }

    // 子任务扩写：合并到现有章节内容中，而非覆盖
    if (subsectionTitle) {
      // 检测 AI 输出首行是否已经是匹配该子节的标题（如 "2.1 温度对发芽率的影响"）
      // 若是则不再重复添加标题，避免 ### 和 2.1 双重标题
      const firstLine = processedContent.trim().split("\n")[0]?.trim() || "";
      const firstLineBody = firstLine.replace(/^\d+(?:\.\d+)*\s*/, "").trim();
      const aiStartsWithMatchingHeading = firstLineBody === subsectionTitle.trim();

      // 尝试在现有内容中定位该子节并替换；若找不到则追加
      const escapedTitle = subsectionTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // 匹配 ### Title / ## Title / X.Y Title 三种格式
      const headingPattern = new RegExp(
        `(?:^|\\n)(?:#{1,3}\\s*)?(?:\\d+\\.?\\d*(?:\\.?\\d+)?\\s*)?${escapedTitle}\\s*\\n`,
        "i"
      );
      const match = existingText.match(headingPattern);

      let merged: string;
      if (match && match.index !== undefined) {
        // 找到该子节 → 保留原标题行，替换标题后的内容到下一个标题前
        const headingEnd = match.index! + match[0].length;
        const afterMatch = existingText.slice(headingEnd);
        const nextHeadingMatch = afterMatch.match(/\n(?:#{1,3} |\d+\.\d+(?:\.\d+)?\s)/);
        const endIdx = nextHeadingMatch
          ? headingEnd + nextHeadingMatch.index!
          : existingText.length;
        // AI 输出首行已是该标题 → 剥掉重复标题行，避免双重标题
        let contentToInsert = processedContent;
        if (aiStartsWithMatchingHeading) {
          const firstNl = contentToInsert.indexOf("\n");
          contentToInsert = firstNl !== -1 ? contentToInsert.slice(firstNl + 1).trimStart() : "";
        }
        merged = existingText.slice(0, headingEnd) + contentToInsert + "\n\n" + existingText.slice(endIdx);
      } else {
        // 未找到 → 追加到章节末尾，使用统一编号标题格式
        const major = majorNumberFromSectionId(sectionId);
        let heading: string;
        if (major != null) {
          const nextSub = maxSecondLevelInText(existingText, major) + 1;
          heading = aiStartsWithMatchingHeading
            ? ""  // AI 首行已经是编号标题，不重复加
            : `${major}.${nextSub} ${subsectionTitle}`;
        } else {
          heading = aiStartsWithMatchingHeading ? "" : `### ${subsectionTitle}`;
        }
        // AI 输出首行已是该标题 → 剥掉重复标题行（与 "found" 分支保持一致）
        let appendContent = processedContent;
        if (aiStartsWithMatchingHeading) {
          const firstNl = appendContent.indexOf("\n");
          appendContent = firstNl !== -1 ? appendContent.slice(firstNl + 1).trimStart() : "";
        }
        const newBlock = heading ? `${heading}\n${appendContent}` : appendContent;
        // 如果 existingText 末尾残留了相同小节的大纲占位标题（无正文），先剥掉再追加
        // 这样可避免"末尾占位行 + AI 输出首行"形成双标题
        const trailingStubRe = new RegExp(
          `(?:\\n|^)(?:#{1,3}\\s*)?(?:\\d+\\.?\\d*(?:\\.\\d+)?\\s*)?${escapedTitle}\\s*$`,
          "i"
        );
        const baseText = existingText.trim().replace(trailingStubRe, "").trim();
        merged = baseText
          ? `${baseText}\n\n${newBlock}`
          : newBlock;
      }

      processedContent = merged;
    } else {
      // 没有子节标题 → 合并到现有内容末尾
      if (existingText.trim()) {
        processedContent = existingText + "\n\n" + processedContent;
      }
    }

    // 保存合并前的现有内容，供最终编号时参考计数器起点
    const existingBeforeMerge = isBodySection ? existingText : "";

    // 最终再跑一次 ensureSubsectionNumbering：修正因合并导致的编号不一致
    // （例如旧 ### 标题未被 normalize 的情况）
    if (isBodySection) {
      processedContent = ensureSubsectionNumbering(processedContent, sectionId, existingBeforeMerge);
    }

    // 归一化非标准引用格式：[参考来源N] / [文献N] / 【16】→ [N]
    processedContent = normalizeAllCitationFormats(processedContent);
    // 清理草稿痕迹 + 去重 + 越界引用剥离后再写入
    const refCount = currentProject.references?.length || 0;
    processedContent = stripOutOfRangeCitations(processedContent, refCount);
    processedContent = cleanDraftArtifacts(processedContent);
    processedContent = deduplicateParagraphs(processedContent);

    // 构建应用后的完整项目快照
    const newSectionsSnapshot = sectionId !== "abstract"
      ? { ...currentProject.sections, [sectionId]: processedContent }
      : currentProject.sections;
    const newAbstractSnapshot = sectionId === "abstract" ? processedContent : (currentProject.abstract || "");

    // 引用只增不减：apply 时不自动剪枝，由用户手动"清理文献"触发
    setProject(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        abstract: newAbstractSnapshot,
        sections: newSectionsSnapshot,
        references: prev.references || [],
      };
    });
    setEditingContent(processedContent);
    if (sectionId !== activeSection) {
      setActiveSection(sectionId);
    }
    toast.success(`内容已应用到 ${sectionId} 章节。引用列表已保留，可通过侧栏"清理文献"按钮整理`);
  };

  const handleOpenFile = (fileName: string) => {
    setCurrentPdf(fileName);
    setRightPanelMode("reader");
    setIsPreviewOpen(true);
  };

  const handleSaveMeta = async (draft: { title: string; authors: string; affiliations: string; abstract: string; keywords: string; classification: string; researchDirection: string; outline: string; template: string; referencesText: string; citationStyle?: "gbt7714" | "vancouver" | "apa7" | "ieee" }) => {
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
      citationStyle: draft.citationStyle || "gbt7714",
      references: draft.referencesText.split(/\n+/).map((ref) => ref.trim()).filter(Boolean),
    };
    const refLines = draft.referencesText.split(/\n+/).map((ref) => ref.trim()).filter(Boolean);
    setProject(updated);
    if (project.id) {
      await projectStore.replaceReferences(project.id, refLines);
    }
    await projectStore.save(updated);
    setIsMetaDialogOpen(false);
    toast.success("项目信息已更新");
  };

  const handleReorderReferences = useReferenceReorder({
    projectRef, editingContentRef, activeSectionRef, setProject, setEditingContent,
  });

  // 清理未被正文引用的参考文献
  const handleCleanReferences = useCallback(() => {
    const p = projectRef.current;
    const currentEditingContent = editingContentRef.current;
    const currentActiveSection = activeSectionRef.current;
    if (!p || !p.references || p.references.length === 0) {
      toast.info("暂无参考文献可清理");
      return;
    }
    const merged = mergeEditorIntoProject(p, currentActiveSection, currentEditingContent);
    const { references: cleaned, removed, indexMap } = pruneUncitedReferences(merged);
    if (removed === 0) {
      toast.info("所有参考文献均在正文中被引用，无需清理");
      return;
    }
    // 重映射所有章节正文中的引用编号
    const remappedAbstract = remapPrunedCitations(merged.abstract || "", indexMap);
    const remappedSections: Record<string, string> = {};
    for (const [key, content] of Object.entries(merged.sections)) {
      remappedSections[key] = remapPrunedCitations(content || "", indexMap);
    }
    const updated = {
      ...p,
      abstract: remappedAbstract,
      sections: remappedSections as typeof p.sections,
      references: cleaned,
    };
    setProject(updated);
    setEditingContent(
      currentActiveSection === "abstract"
        ? remappedAbstract
        : remappedSections[currentActiveSection] ?? currentEditingContent,
    );
    if (p.id) {
      void projectStore.replaceReferences(p.id, cleaned).then(() =>
        projectStore.save(updated),
      );
    }
    toast.success(`已移除 ${removed} 条未引用文献，剩余 ${cleaned.length} 条（正文引用号已同步更新）`);
  }, [projectRef, editingContentRef, activeSectionRef, setProject, setEditingContent]);

  const aiParagraph = useAiParagraph({ project, activeSection, setProject });
  const handleExpandParagraph = (content: string) => aiParagraph.run("expand", content);
  const handleAuditParagraph = (content: string) => aiParagraph.run("audit", content);
  const handleFixParagraph = (content: string, feedback: string) => aiParagraph.run("fix", content, feedback);
  const handleSelectionAction = useCallback(
    (text: string, action: ParagraphSelectionAction) =>
      aiParagraph.run(action as AiParagraphAction, text),
    [aiParagraph],
  );

  const handleExportDoc = useDocxExport({
    project, activeSection, editingContent, saveProject: handleSave,
  });

  const handleExportMarkdown = useMarkdownExport(project, activeSection, editingContent);
  const handleExportPDF = usePdfExport(project, activeSection, editingContent);

  // 稳定的回调引用，防止 WritingPanel 的 useEffect 无限重渲染
  const handleGeneratingChange = useCallback((generating: boolean) => {
    setIsWritingGenerating(generating);
    if (!generating) {
      setAiPreview(prev => prev ? { ...prev, isStreaming: false } : null);
    }
  }, []);
  const handlePreviewUpdate = useCallback((data: {
    content: string;
    pipelineSteps: import("@/hooks/use-writing-stream").PipelineStep[];
    verification: string;
    citationWarnings: { num: number; overlap: number; context: string }[];
    dataClaimWarnings: { claimId: string; claimText: string; found: boolean; citedCorrectly: boolean; issue?: string }[];
    detectedRefs: string[];
    targetSection: string;
    subsectionTitle?: string;
    isStreaming?: boolean;
  }) => {
    setAiPreview({ ...data, isStreaming: data.isStreaming ?? true });
  }, []);
  const handleUpdateProject = useCallback((updates: Partial<ProjectData>) => {
    setProject((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...updates };
      if (updates.references && Array.isArray(updates.references)) {
        next.references = Array.from(new Set([...(prev.references || []), ...updates.references]));
      }
      return next;
    });
  }, []);
  const handleTaskExpanded = useCallback((taskIds: string | string[]) => {
    const ids = Array.isArray(taskIds) ? taskIds : [taskIds];
    setExpandedOutlineSections((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return [...next];
    });
  }, []);
  const handleClearPreselected = useCallback(() => setPendingExpandTask(null), []);

  return (
    <ErrorBoundary>
    <div className={cn("flex h-screen overflow-hidden relative", siteTheme.bgSoft)}>
      <WorkbenchTabSwitcher
        activeTab={activeTab} setActiveTab={setActiveTab}
        isWritingGenerating={isWritingGenerating}
        handleSave={handleSave} projectId={projectId}
        projectMode={project.mode ?? "review"}
        setRightPanelMode={setRightPanelMode}
        setIsPreviewOpen={setIsPreviewOpen}
      />

      {/* Second Left: Dynamic Panel */}
      <div 
        className={cn(
          "border-r flex flex-col transition-all duration-300 ease-in-out overflow-hidden bg-white/90",
          modeAccent.borderTint,
          isSidebarOpen ? "w-80" : "w-0",
        )}
      >
        <div className="flex flex-col h-full w-80">
          <header className={cn("h-14 border-b flex items-center justify-between px-4 shrink-0", modeAccent.headerTint, modeAccent.borderTint)}>
            <div className="flex flex-col min-w-0 gap-0.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-sm text-[#122820] truncate">
                  {activeTab === "structure" && getStructurePanelTitle(writingMode)}
                  {activeTab === "data" && "实验数据"}
                  {activeTab === "outline" && "论证提纲"}
                  {activeTab === "writing" && "章节协作向导"}
                  {activeTab === "reader" && "文献库"}
                  {activeTab === "plagiarism" && "论文质量检测"}
                  {activeTab === "xrd" && "XRD 分析"}
                </span>
                <ProjectModeBadge mode={writingMode} />
              </div>
              {activeTab === "structure" && (
                <span className="text-[10px] text-[#6b7c72] font-normal leading-tight line-clamp-2">
                  {getStructurePanelHint(writingMode)}
                </span>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsSidebarOpen(false)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </header>
          
          <div className="flex-1 overflow-hidden p-4">
            {activeTab === "plagiarism" && (
              <div className="h-full min-h-0 flex flex-col overflow-hidden">
                <ErrorBoundary>
                  <LazyPlagiarismPanel
                    projectId={projectId ?? undefined}
                    projectTitle={project.title}
                    initialContent={buildPlagiarismContentFromProject(
                      mergeEditorIntoProject(project, activeSection, editingContent),
                    )}
                  />
                </ErrorBoundary>
              </div>
            )}
            {activeTab === "structure" && (
              <div className="h-full min-h-0 flex flex-col overflow-hidden">
                <p className="shrink-0 text-[10px] text-[#6b7c72] px-1 pb-2 border-b mb-2 leading-relaxed">
                  点选章节后，中间编辑器与预览对应该段；引用重排会扫描<strong>含当前编辑区</strong>的全文。
                </p>
                <div className="shrink-0 space-y-0.5">
                  {structureSections.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setActiveSection(s.id)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center justify-between group",
                        activeSection === s.id
                          ? modeAccent.sectionActive
                          : "text-[#3d4f46] hover:bg-black/[0.03]",
                      )}
                    >
                      <span className="truncate font-medium">{s.label}</span>
                      {project.sections[s.id] && (
                        <CheckCircle2
                          className={cn(
                            "h-3.5 w-3.5 ml-2 shrink-0",
                            activeSection === s.id ? "text-white/90" : modeAccent.iconText,
                          )}
                        />
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
                  <div className="pt-4 mt-4 border-t">
                    <ReferenceBrowser
                      projectId={projectId ?? undefined}
                      references={project.references || []}
                      activeSectionContent={
                        activeSection === "abstract"
                          ? project.abstract
                          : project.sections[activeSection]
                      }
                      allContents={sectionContentsForRefs}
                    />
                  </div>

                  <div className="pt-4 mt-4 border-t space-y-4 pb-2">
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
              </div>
            )}
            {/* 所有面板保持挂载，切换不销毁状态 */}
            {activeTab === "data" && projectId && (
              <div className="h-full min-h-0 flex flex-col overflow-hidden">
                <ErrorBoundary>
                  <LazyDataPanel
                    projectId={projectId}
                    project={project}
                    onSave={(updates) => setProject(prev => ({ ...prev, ...updates }))}
                    onOpenProjectSettings={() => setIsMetaDialogOpen(true)}
                    onInsertClaim={(claimText) => {
                      handleApplyAiContent(`${editingContent}\n\n${claimText}\n\n`, activeSection);
                    }}
                  />
                </ErrorBoundary>
              </div>
            )}
            {activeTab === "outline" && projectId && (
              <div className="h-full min-h-0 flex flex-col overflow-hidden">
                <ErrorBoundary>
                  <LazyOutlinePanel
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
                </ErrorBoundary>
              </div>
            )}
            {/* Writing tab: 切换时通过 sessionStorage 自动恢复写作状态 */}
            {activeTab === "writing" && projectId && (
              <div className="h-full min-h-0 flex flex-col overflow-hidden">
                <ErrorBoundary>
                  <LazyWritingPanel
                    projectId={projectId}
                    project={project}
                    editorActiveSection={activeSection}
                    preselectedTaskId={pendingExpandTask}
                    expandedSections={expandedOutlineSections}
                    onTaskExpanded={handleTaskExpanded}
                    onClearPreselected={handleClearPreselected}
                    onGenerate={handleApplyAiContent}
                    onDraftApplied={focusEditorAfterDraft}
                    onGeneratingChange={handleGeneratingChange}
                    onPreviewUpdate={handlePreviewUpdate}
                    onUpdateProject={handleUpdateProject}
                  />
                </ErrorBoundary>
              </div>
            )}
            {activeTab === "reader" && (
              <div className="h-full min-h-0 flex flex-col overflow-hidden">
                <ErrorBoundary>
                  <LazyReaderPanel onOpenFile={handleOpenFile} />
                </ErrorBoundary>
              </div>
            )}
            {activeTab === "xrd" && projectId && (
              <div className="h-full min-h-0 flex flex-col overflow-hidden">
                <ErrorBoundary>
                  <LazyXrdPanel
                    projectId={projectId}
                    activeSection={activeSection}
                    onInsertToPaper={(imageBase64, caption) => {
                      const mdImage = `\n\n![${caption}](${imageBase64})\n\n`;
                      handleApplyAiContent(editingContent + mdImage, activeSection);
                      toast.success(`图表「${caption}」已插入到 ${activeSection} 章节`);
                    }}
                  />
                </ErrorBoundary>
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
            onCleanReferences={handleCleanReferences}
            onExportDoc={handleExportDoc}
            onExportMarkdown={handleExportMarkdown}
            onExportPDF={handleExportPDF}
            onExpandParagraph={handleExpandParagraph}
            onAuditParagraph={handleAuditParagraph}
            onFixParagraph={handleFixParagraph}
            onSelectionAction={handleSelectionAction}
            aiPreview={aiPreview}
            onApplyAiOutput={() => {
              if (aiPreview?.content) {
                handleApplyAiContent(aiPreview.content, aiPreview.targetSection, aiPreview.subsectionTitle);
                focusEditorAfterDraft(aiPreview.targetSection);
              } else {
                setAiPreview(null);
              }
            }}
            onCancelAiOutput={() => {
              setAiPreview(null);
            }}
            projectId={projectId || "default"}
          />
        </ResizablePanel>

        {isPreviewOpen && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={40} minSize={20}>
              <div className="bg-white/90 flex flex-col h-full overflow-hidden border-l">
                <header className={cn("h-14 border-b flex items-center px-6 shrink-0 justify-between", modeAccent.headerTint, modeAccent.borderTint)}>
                  <span className="font-semibold text-sm flex items-center gap-2 min-w-0 text-[#122820]">
                    {rightPanelMode === "preview" ? (
                      <>
                        <Eye className={cn("h-4 w-4 shrink-0", modeAccent.iconText)} />
                        <span className="truncate max-w-[180px]">{project.title || "未命名论文"}</span>
                        <ProjectModeBadge mode={writingMode} />
                      </>
                    ) : (
                      <>
                        <FileSearch className={cn("h-4 w-4", modeAccent.iconText)} /> 文献详情
                      </>
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
        onApplyFix={(content, sectionKey) => handleApplyAiContent(content, sectionKey)}
        onJumpToSection={(sectionKey) => setActiveSection(sectionKey)}
      />
    </div>
    </ErrorBoundary>
  );
}
