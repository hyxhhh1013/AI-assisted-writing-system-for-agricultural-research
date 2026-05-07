"use client";

import { useState, useEffect, Suspense, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  buildReorderedReferences,
  collectCitationFirstAppearance,
  remapBracketCitations,
} from "@/lib/reference-reorder";
import { mergeEditorIntoProject, stripHtmlToPlainForDocx } from "@/lib/export-content";
import { ensureSubsectionNumbering } from "@/lib/academic-numbering";
import { formatKeywords } from "@/lib/paper-metadata";
import {
  ArrowLeft, Loader2, Send, Copy, Save,
  FileText, Layout, BookOpen, Database,
  Languages, CheckCircle2, Menu, ChevronLeft, ChevronRight,
  Eye, EyeOff, Download, Settings2, FileCode, Printer,
  GripVertical, FileType, BarChart3, Search, FileSearch,
  AlertTriangle, CheckCheck, XCircle, RefreshCw, Radar
} from "lucide-react";
import { toast } from "sonner";
import { projectStore, ProjectData } from "@/lib/store";
import type { ConsistencyReport, ConsistencyIssue } from "@/types/consistency";
import SCIPreview from "@/components/sci-preview";
import { exportProjectToPdf } from "@/services/pdf-export";
import { 
  ResizableHandle, 
  ResizablePanel, 
  ResizablePanelGroup 
} from "@/components/ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AnalysisPanel } from "@/components/shared/analysis-panel";
import { OutlinePanel } from "@/components/shared/outline-panel";
import { WritingPanel } from "@/components/shared/writing-panel";
import { ReaderPanel } from "@/components/shared/reader-panel";
import { PlagiarismPanel } from "@/components/shared/plagiarism-panel";
import { XrdPanel } from "@/components/shared/xrd-panel";
import { EditorImageGallery } from "@/components/shared/editor-image-gallery";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import { ReferenceBrowser } from "@/components/shared/reference-browser";
import dynamic from "next/dynamic";

const ParagraphEditor = dynamic(
  () => import("@/components/shared/paragraph-editor").then(mod => mod.ParagraphEditor),
  { ssr: false }
);

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

interface ProjectMetaDraft {
  title: string;
  authors: string;
  affiliations: string;
  abstract: string;
  keywords: string;
  classification: string;
  researchDirection: string;
  outline: string;
  template: string;
  referencesText: string;
}

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
  const [isMetaDialogOpen, setIsMetaDialogOpen] = useState(false);
  const [isConsistencyOpen, setIsConsistencyOpen] = useState(false);
  const [isConsistencyLoading, setIsConsistencyLoading] = useState(false);
  const [consistencyReport, setConsistencyReport] = useState<ConsistencyReport | null>(null);
  const [tempMeta, setTempMeta] = useState<ProjectMetaDraft>({
    title: "",
    authors: "",
    affiliations: "",
    abstract: "",
    keywords: "",
    classification: "",
    researchDirection: "",
    outline: "",
    template: "sci",
    referencesText: "",
  });
  const previewRef = useRef<HTMLDivElement>(null);
  // 使用 ref 存储最新值，避免 setTimeout/stale closure 中读到旧状态
  const projectRef = useRef(project);
  projectRef.current = project;
  const editingContentRef = useRef(editingContent);
  editingContentRef.current = editingContent;
  const activeSectionRef = useRef(activeSection);
  activeSectionRef.current = activeSection;

  const metaPreviewProject = useMemo<ProjectData>(() => {
    const merged = mergeEditorIntoProject(project, activeSection, editingContent);
    if (!isMetaDialogOpen) return merged;

    return {
      ...merged,
      title: tempMeta.title,
      authors: tempMeta.authors,
      affiliations: tempMeta.affiliations,
      abstract: tempMeta.abstract,
      keywords: tempMeta.keywords,
      classification: tempMeta.classification,
      researchDirection: tempMeta.researchDirection,
      outline: tempMeta.outline,
      template: tempMeta.template,
      references: tempMeta.referencesText
        .split(/\n+/)
        .map((ref) => ref.trim())
        .filter(Boolean),
    };
  }, [project, activeSection, editingContent, isMetaDialogOpen, tempMeta]);

  const previewProject = useMemo(
    () => metaPreviewProject,
    [metaPreviewProject],
  );

  const syncMetaDraft = (data: ProjectData) => {
    setTempMeta({
      title: data.title,
      authors: data.authors,
      affiliations: data.affiliations || "",
      abstract: data.abstract,
      keywords: data.keywords || "",
      classification: data.classification || "",
      researchDirection: data.researchDirection || "",
      outline: data.outline || "",
      template: data.template || "sci",
      referencesText: (data.references || []).join("\n"),
    });
  };

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
        syncMetaDraft(data);

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

  // 核心优化：实时将编辑内容同步到 project 状态，确保预览和导出始终是最新的
  // 使用 ref 读取最新 project，避免闭包中读到旧状态导致误覆盖
  useEffect(() => {
    const timer = setTimeout(() => {
      const latestProject = projectRef.current;
      if (!latestProject.id) return;

      if (activeSection === "abstract") {
        if (latestProject.abstract !== editingContent) {
          setProject(prev => ({ ...prev, abstract: editingContent }));
        }
      } else {
        if (latestProject.sections[activeSection] !== editingContent) {
          setProject(prev => ({
            ...prev,
            sections: {
              ...prev.sections,
              [activeSection]: editingContent
            }
          }));
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [editingContent, activeSection]);

  const handleSave = async () => {
    // 始终使用当前内存中的 project 状态，确保摘要和各章节都能正确更新
    const updatedProject = mergeEditorIntoProject(project, activeSection, editingContent);
    setProject(updatedProject);
    await projectStore.save(updatedProject);
    toast.success("项目已保存到云端");
  };

  // 自动保存逻辑
  useEffect(() => {
    if (projectId && project && project.id) {
      const timer = setTimeout(async () => {
        await projectStore.save(project);
      }, 2000); // 自动保存间隔 2s
      return () => clearTimeout(timer);
    }
  }, [project, projectId]);

  const handleApplyAiContent = (content: string, sectionId: string) => {
    // 对「结果与讨论」和「结论」章节，如果 AI 没有自行添加子节编号，
    // 则自动补上递增的「X.Y.Z」编号
    let processedContent = content;
    if (sectionId === "results" || sectionId === "conclusion") {
      const currentProject = projectRef.current;
      const existingText = currentProject?.sections?.[sectionId] || "";
      processedContent = ensureSubsectionNumbering(content, sectionId, existingText);
    }

    setProject(prev => {
      if (!prev) return prev;

      if (sectionId === "abstract") {
        return { ...prev, abstract: processedContent };
      }
      return { ...prev, sections: { ...prev.sections, [sectionId]: processedContent } };
    });
    // 始终同步编辑器内容
    setEditingContent(processedContent);
    // 切换到对应章节
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

  const handleSaveMeta = async () => {
    const updated: ProjectData = {
      ...project,
      title: tempMeta.title,
      authors: tempMeta.authors,
      affiliations: tempMeta.affiliations,
      abstract: tempMeta.abstract,
      keywords: tempMeta.keywords,
      classification: tempMeta.classification,
      researchDirection: tempMeta.researchDirection,
      outline: tempMeta.outline,
      template: tempMeta.template,
      references: tempMeta.referencesText
        .split(/\n+/)
        .map((ref) => ref.trim())
        .filter(Boolean),
    };
    setProject(updated);
    await projectStore.save(updated);
    setIsMetaDialogOpen(false);
    toast.success("项目信息已更新");
  };

  /**
   * 跨章节一致性检查
   */
  const handleConsistencyCheck = async () => {
    const merged = mergeEditorIntoProject(project, activeSection, editingContent);
    const sections = [
      { key: "abstract", content: merged.abstract || "" },
      { key: "introduction", content: merged.sections.introduction || "" },
      { key: "methods", content: merged.sections.methods || "" },
      { key: "results", content: merged.sections.results || "" },
      { key: "conclusion", content: merged.sections.conclusion || "" },
    ].filter((s) => s.content.trim().length > 0);

    if (sections.length < 2) {
      toast.error("至少需要 2 个章节有内容才能进行一致性检查");
      return;
    }

    setIsConsistencyLoading(true);
    setConsistencyReport(null);
    setIsConsistencyOpen(true);

    try {
      const response = await fetch("/api/consistency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: merged.title,
          sections,
          outline: merged.outline,
        }),
      });

      if (!response.ok) throw new Error("一致性检查请求失败");

      const report = await response.json();
      setConsistencyReport(report);

      if (report.passed) {
        toast.success("一致性检查通过！");
      } else {
        toast.warning(`发现 ${report.issues?.length || 0} 个一致性问题`);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsConsistencyLoading(false);
    }
  };

  /**
   * 自动重排参考文献：按正文首次出现顺序，并重写 [n]。
   * 合并当前编辑器未保存内容与各章已保存内容；替换编号用占位符避免互换代号错乱。
   */
  const handleReorderReferences = async () => {
    const currentProject = projectRef.current;
    const currentEditingContent = editingContentRef.current;
    const currentActiveSection = activeSectionRef.current;
    if (!currentProject || !currentProject.references || currentProject.references.length === 0) {
      toast.error("暂无参考文献可重排");
      return;
    }

    const merged = mergeEditorIntoProject(currentProject, currentActiveSection, currentEditingContent);
    const abstractScan = merged.abstract || "";
    const sectionScan = (id: string) => merged.sections[id] || "";

    const allContent = [
      abstractScan,
      sectionScan("introduction"),
      sectionScan("methods"),
      sectionScan("results"),
      sectionScan("conclusion"),
    ].join("\n\n");

    const appearanceOrder = collectCitationFirstAppearance(
      allContent,
      currentProject.references.length,
    );

    if (appearanceOrder.length === 0) {
      toast.info("未在正文中检测到有效引用编号（含当前编辑区）");
      return;
    }

    const built = buildReorderedReferences(appearanceOrder, currentProject.references, {
      includeUncited: true,
    });
    if (!built) {
      toast.error("重排计算失败");
      return;
    }

    const { references: newRefs, indexMap } = built;

    const nextAbstract = remapBracketCitations(abstractScan, indexMap);
    const updatedSections = { ...currentProject.sections };
    (["introduction", "methods", "results", "conclusion"] as const).forEach((id) => {
      const src = sectionScan(id);
      updatedSections[id] = remapBracketCitations(src, indexMap);
    });

    const updatedProject: ProjectData = {
      ...currentProject,
      abstract: nextAbstract,
      references: newRefs,
      sections: updatedSections,
    };

    setProject(updatedProject);
    setEditingContent(
      currentActiveSection === "abstract"
        ? nextAbstract
        : updatedSections[currentActiveSection as keyof typeof updatedSections] || "",
    );
    await projectStore.save(updatedProject);

    toast.success(`已按正文引用顺序重排 ${newRefs.length} 条参考文献`);
  };

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

  const handleExportDoc = async () => {
    if (!project) return;

    await projectStore.save(project);
    const p = mergeEditorIntoProject(project, activeSection, editingContent);

    const template = p.template || "sci";
    const isChinese = template === "gbt7713";
    const isNature = template === "nature";
    const isIEEE = template === "ieee";

    // 定义模板特定的配置
    const config = {
      fontMain: isChinese ? "SimSun" : "Times New Roman",
      fontHeading: isChinese ? "SimHei" : (isIEEE ? "Arial" : "Times New Roman"),
      titleSize: isChinese ? 44 : (isNature ? 36 : 32),
      heading1Size: isChinese ? 28 : (isNature ? 24 : 22),
      bodySize: isChinese ? 24 : (isNature ? 22 : 21),
      lineSpacing: isChinese ? 360 : (isNature ? 300 : 240),
      indent: isChinese ? 420 : 0,
    };

    // 辅助函数：将 Markdown 文本转换为 docx TextRun 数组
    const parseMarkdownToRuns = (text: string, options: { font?: string; size?: number; color?: string } = {}): TextRun[] => {
      if (!text) return [new TextRun({ text: "", ...options })];

      // 图片标记：docx 不支持直接嵌入图片，显示为说明文字
      const imgMatch = text.match(/^!\[([^\]]*)\]\([^)]+\)$/);
      if (imgMatch) return [new TextRun({ text: `[图片: ${imgMatch[1] || "chart"}]`, italics: true, color: "888888", ...options })];

      const runs: TextRun[] = [];
      const parts = text.split(/(\*\*.*?\*\*)/g);

      parts.forEach(part => {
        if (part.startsWith("**") && part.endsWith("**")) {
          runs.push(new TextRun({ text: part.slice(2, -2), bold: true, font: options.font || config.fontMain, size: options.size || config.bodySize, color: options.color }));
        } else {
          const lines = part.split("\n");
          lines.forEach((line, i) => {
            runs.push(new TextRun({ text: line, font: options.font || config.fontMain, size: options.size || config.bodySize, color: options.color }));
            if (i < lines.length - 1) runs.push(new TextRun({ text: "", break: 1 }));
          });
        }
      });
      return runs;
    };

    // 辅助计算参考文献
    const refParagraphs = (p.references && p.references.length > 0)
      ? p.references.map((ref, idx) => 
          new Paragraph({
            children: [
              new TextRun({
                text: `[${idx + 1}] ${ref}`,
                size: isChinese ? 18 : 16,
                font: config.fontMain,
              }),
            ],
            spacing: { after: 100 },
            alignment: AlignmentType.LEFT,
          })
        )
      : [
          new Paragraph({
            children: [
              new TextRun({
                text: isChinese 
                  ? "[1] 国家标准局. GB/T 7713-1987 科学技术报告、学位论文和学术论文的编写格式[S]. 北京: 中国标准出版社, 1987."
                  : "[1] National Standard of PRC. GB/T 7713-1987 Presentation of scientific and technical reports, theses and academic papers [S]. Beijing: Standards Press of China, 1987.",
                size: isChinese ? 18 : 16,
                font: config.fontMain,
              }),
            ],
            spacing: { after: 100 },
            alignment: AlignmentType.LEFT,
          })
        ];

    try {
      const templateName = isChinese ? "国标 (GB/T 7713)" : (isNature ? "Nature" : (isIEEE ? "IEEE" : "SCI"));
      toast.info(`正在按照 ${templateName} 规范生成 Word 文档...`);
      
      const doc = new Document({
        styles: {
          paragraphStyles: [
            {
              id: "Heading1",
              name: "Heading 1",
              basedOn: "Normal",
              next: "Normal",
              quickFormat: true,
              run: {
                size: config.heading1Size,
                bold: true,
                color: "000000",
                font: config.fontHeading,
                allCaps: isIEEE, // IEEE 标题通常全大写
              },
              paragraph: {
                spacing: { before: 400, after: 200 },
                alignment: isIEEE ? AlignmentType.CENTER : AlignmentType.LEFT,
              },
            },
            {
              id: "Heading2",
              name: "Heading 2",
              basedOn: "Normal",
              next: "Normal",
              quickFormat: true,
              run: {
                size: config.heading1Size - 4,
                bold: true,
                italics: isNature, // Nature 二级标题通常斜体
                color: "000000",
                font: config.fontHeading,
              },
              paragraph: {
                spacing: { before: 300, after: 150 },
                alignment: AlignmentType.LEFT,
              },
            },
          ],
          default: {
            document: {
              run: {
                size: config.bodySize,
                font: config.fontMain,
                color: "000000",
              },
            },
          },
        },
        sections: [{
          properties: {
            page: {
              margin: {
                top: 1440,
                right: 1440,
                bottom: 1440,
                left: 1440,
              },
            },
          },
          children: [
            // Title
            new Paragraph({
              children: [
                new TextRun({
                  text: p.title || (isChinese ? "无标题论文" : "Untitled Paper"),
                  bold: true,
                  size: config.titleSize, 
                  font: config.fontHeading,
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 400, after: 400 },
            }),
            // Authors
            new Paragraph({
              children: [
                new TextRun({
                  text: p.authors || "",
                  size: isChinese ? 28 : 24, 
                  font: config.fontMain,
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
            }),
            // Institution
            new Paragraph({
              children: [
                new TextRun({
                  text: isChinese 
                    ? `（${p.affiliations || "农业科学研究中心，北京 100083"}）`
                    : `(${p.affiliations || "Agricultural Science Laboratory, Beijing 100083"})`,
                  size: 18, 
                  font: config.fontMain,
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 600 },
            }),

            // Abstract（多段 + 去 HTML）
            ...(() => {
              const absPlain = stripHtmlToPlainForDocx(p.abstract || "");
              const stanzas = absPlain.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
              if (stanzas.length === 0) {
                return [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: isChinese ? "摘要：" : "Abstract: ",
                        bold: true,
                        size: config.bodySize,
                        font: config.fontHeading,
                      }),
                    ],
                    alignment: AlignmentType.JUSTIFIED,
                    spacing: { line: config.lineSpacing, before: 200, after: 200 },
                    indent: isChinese ? { firstLine: config.indent } : undefined,
                  }),
                ];
              }
              return stanzas.map((para, i) =>
                new Paragraph({
                  children: i === 0
                    ? [new TextRun({ text: isChinese ? "摘要：" : "Abstract: ", bold: true, size: config.bodySize, font: config.fontHeading }), ...parseMarkdownToRuns(para)]
                    : parseMarkdownToRuns(para),
                  alignment: AlignmentType.JUSTIFIED,
                  spacing: { line: config.lineSpacing, before: i === 0 ? 200 : 0, after: 200 },
                  indent: isChinese ? { firstLine: config.indent } : undefined,
                }));
            })(),

            // Keywords
            new Paragraph({
              children: [
                new TextRun({
                  text: isChinese ? "关键词：" : "Keywords: ",
                  bold: true,
                  size: config.bodySize,
                  font: config.fontHeading,
                }),
                new TextRun({
                  text: formatKeywords(p, isChinese ? "zh" : "en"),
                  size: config.bodySize,
                  font: config.fontMain,
                }),
              ],
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: 400 },
              indent: isChinese ? { firstLine: config.indent } : undefined,
            }),
            
            // Sections
            ...Object.entries({
              introduction: isChinese ? "引言" : "Introduction",
              methods: isChinese ? "材料与方法" : "Materials and Methods",
              results: isChinese ? "结果与讨论" : "Results and Discussion",
              conclusion: isChinese ? "结论" : "Conclusion",
            }).flatMap(([key, label], index) => {
              const raw = p.sections[key] || "";
              const content = stripHtmlToPlainForDocx(raw);
              if (!content) return [];

              const sectionNumber = index + 1;
              const romanNumerals = ["I", "II", "III", "IV"];
              const fullLabel = isIEEE ? `${romanNumerals[index]}. ${label.toUpperCase()}` : `${sectionNumber} ${label}`;
              const elements: Paragraph[] = [];

              elements.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: fullLabel,
                      bold: true,
                      size: config.heading1Size,
                      font: config.fontHeading,
                    }),
                  ],
                  heading: HeadingLevel.HEADING_1,
                  spacing: { before: 240, after: 120 },
                  alignment: AlignmentType.LEFT,
                }),
              );

              const stanzas = content.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
              let h2Counter = 0;

              for (const stanza of stanzas) {
                const hm = stanza.match(/^(#{1,6})\s+(.+)$/);
                const isSingleLineHeading = hm && !stanza.includes("\n");

                if (isSingleLineHeading && hm) {
                  const level = hm[1].length;
                  let titleText = hm[2].trim();
                  titleText = titleText.replace(/^([\d.]+|[一二三四五六七八九十]+[、.\s])\s*/, "");
                  let finalTitle = titleText;
                  if (level <= 3) {
                    h2Counter++;
                    finalTitle = isIEEE
                      ? `${String.fromCharCode(64 + h2Counter)}. ${titleText}`
                      : `${sectionNumber}.${h2Counter} ${titleText}`;
                  }
                  elements.push(
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: finalTitle,
                          bold: true,
                          size: config.heading1Size - 4,
                          font: config.fontHeading,
                        }),
                      ],
                      heading: HeadingLevel.HEADING_2,
                      alignment: AlignmentType.LEFT,
                      spacing: { before: 180, after: 100 },
                    }),
                  );
                } else {
                  elements.push(
                    new Paragraph({
                      children: parseMarkdownToRuns(stanza),
                      alignment: AlignmentType.JUSTIFIED,
                      spacing: { line: config.lineSpacing, after: 200 },
                      indent: isChinese ? { firstLine: config.indent } : undefined,
                    }),
                  );
                }
              }

              return elements;
            }),
            
            // References Title
            new Paragraph({
              children: [
                new TextRun({
                  text: isChinese ? "参考文献" : "References",
                  bold: true,
                  size: config.heading1Size,
                  font: config.fontHeading,
                }),
              ],
              style: "Heading1",
              spacing: { before: 600, after: 200 },
              alignment: isIEEE ? AlignmentType.CENTER : AlignmentType.LEFT,
            }),
            ...refParagraphs,
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${p.title || "paper"}.docx`);
      toast.success(`Word 文档导出成功！已应用 ${templateName} 排版规范`);
    } catch (error) {
      console.error("Export Error:", error);
      toast.error("Word 导出失败，请重试");
    }
  };

  const handleExportMarkdown = () => {
    const p = mergeEditorIntoProject(project, activeSection, editingContent);
    const content = `
# ${p.title || "Untitled Research Paper"}

**Authors:** ${p.authors || "Author Name"}

## Abstract
${p.abstract || "No abstract provided."}

## 1. Introduction
${p.sections.introduction || "N/A"}

## 2. Materials and Methods
${p.sections.methods || "N/A"}

## 3. Results and Discussion
${p.sections.results || "N/A"}

## 4. Conclusion
${p.sections.conclusion || "N/A"}
    `;

    const blob = new Blob([content + `
## ${p.template === "gbt7713" ? "参考文献" : "References"}
${(p.references && p.references.length > 0) 
  ? p.references.map((ref, i) => `[${i+1}] ${ref}`).join("\n\n") 
  : (p.template === "gbt7713" 
    ? "[1] 国家标准局. GB/T 7713-1987 科学技术报告、学位论文和学术论文的编写格式[S]. 北京: 中国标准出版社, 1987." 
    : "[1] National Standard of PRC. GB/T 7713-1987 Presentation of scientific and technical reports, theses and academic papers [S]. Beijing: Standards Press of China, 1987.")}
`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${p.title || 'research_paper'}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("已生成 Markdown 文件并开始下载");
  };

  const handleExportPDF = async () => {
    if (!project) return;

    try {
      toast.info("正在准备 PDF 数据，请稍候…");
      const exportProject = mergeEditorIntoProject(project, activeSection, editingContent);
      await exportProjectToPdf(exportProject);
      toast.success("PDF 导出成功！");
    } catch (error: unknown) {
      console.error("PDF Export Error:", error);
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`PDF 导出失败: ${msg}`);
    }
  };


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
          >
            <FileText className="h-5 w-5" />
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
                    onClick={() => {
                      syncMetaDraft(previewProject);
                      setIsMetaDialogOpen(true);
                    }}
                  >
                    <Settings2 className="h-3.5 w-3.5" /> 更多项目设置
                  </Button>
                </div>
              </div>
            )}
            {activeTab === "analysis" && projectId && (
              <AnalysisPanel
                projectId={projectId}
                project={project}
                onSave={(updates) => setProject(prev => ({ ...prev, ...updates }))}
                onInsertToPaper={(imageUrl, caption) => {
                  const mdImage = `\n\n![${caption}](${imageUrl})\n\n`;
                  handleApplyAiContent(editingContent + mdImage, activeSection);
                }}
              />
            )}
            {activeTab === "outline" && projectId && (
              <OutlinePanel
                projectId={projectId}
                project={project}
                onSave={(updates) => {
                  setProject(prev => {
                    const next = { ...prev, ...updates };
                    projectStore.save(next).catch(() => {});
                    return next;
                  });
                }}
                onTabChange={setActiveTab}
              />
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
                  onGenerate={handleApplyAiContent}
                  onAutoReorder={handleReorderReferences}
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
            {activeTab === "reader" && (
              <ReaderPanel onOpenFile={handleOpenFile} />
            )}
            {activeTab === "plagiarism" && (
              <div className="h-full overflow-y-auto pr-2 custom-scrollbar">
                <PlagiarismPanel
                  projectId={projectId ?? undefined}
                  projectTitle={project.title}
                />
              </div>
            )}
            {activeTab === "xrd" && projectId && (
              <div className="h-full overflow-y-auto pr-2 custom-scrollbar">
                <XrdPanel
                  projectId={projectId}
                  activeSection={activeSection}
                  onInsertToPaper={(imageBase64, caption) => {
                    // 插入 Markdown 图片到当前编辑章节
                    const mdImage = `\n\n![${caption}](${imageBase64})\n\n`;
                    handleApplyAiContent(
                      editingContent + mdImage,
                      activeSection
                    );
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
          <div className="flex flex-col h-full bg-background relative">
            <header className="h-14 border-b bg-card flex items-center justify-between px-6 shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="bg-primary/10 p-1.5 rounded-md">
                    <FileType className="h-4 w-4 text-primary" />
                  </div>
                  <span className="font-bold text-sm">
                    {SECTIONS.find(s => s.id === activeSection)?.label}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-muted rounded-md p-0.5">
                  <Button 
                    variant={editorMode === "classic" ? "secondary" : "ghost"} 
                    size="sm" 
                    className="h-7 text-[10px] px-2"
                    onClick={() => setEditorMode("classic")}
                  >
                    经典模式
                  </Button>
                  <Button 
                    variant={editorMode === "paragraph" ? "secondary" : "ghost"} 
                    size="sm" 
                    className="h-7 text-[10px] px-2"
                    onClick={() => setEditorMode("paragraph")}
                  >
                    段落模式
                  </Button>
                </div>

                <div className="h-4 w-px bg-border mx-1" />
                
                <div className="flex items-center bg-muted rounded-md p-0.5">
                  <Button 
                    variant={rightPanelMode === "preview" ? "secondary" : "ghost"} 
                    size="sm" 
                    className="h-7 text-[10px] px-2"
                    onClick={() => {
                      setRightPanelMode("preview");
                      setIsPreviewOpen(true);
                    }}
                  >
                    预览模式
                  </Button>
                  <Button 
                    variant={rightPanelMode === "reader" ? "secondary" : "ghost"} 
                    size="sm" 
                    className="h-7 text-[10px] px-2"
                    onClick={() => {
                      setRightPanelMode("reader");
                      setIsPreviewOpen(true);
                    }}
                  >
                    文献阅读
                  </Button>
                </div>
                
                <div className="h-4 w-px bg-border mx-1" />

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-amber-600 border-amber-300 hover:bg-amber-50"
                  onClick={handleConsistencyCheck}
                  title="检查各章节之间的术语、数据、逻辑一致性"
                >
                  <AlertTriangle className="h-3.5 w-3.5" /> 一致性检查
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/5"
                  onClick={handleReorderReferences}
                  title="根据正文引用顺序自动排列文献列表"
                >
                  <Database className="h-3.5 w-3.5" /> 引用重排
                </Button>
                
                <DropdownMenu>
                  <DropdownMenuTrigger render={
                    <Button variant="outline" size="sm" className="h-8 gap-2">
                      <Download className="h-3.5 w-3.5" /> 导出
                    </Button>
                  } />
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={handleExportDoc}>Word 文档 (.docx)</DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportMarkdown}>Markdown 文件 (.md)</DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportPDF}>导出 PDF</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.print()}>浏览器打印</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>

            <main className="flex-1 overflow-auto p-6 md:p-10 lg:p-16 bg-muted/5">
              <div className={cn(
                "max-w-4xl mx-auto min-h-full flex flex-col",
                editorMode === "classic" ? "bg-card rounded-2xl shadow-xl border overflow-hidden" : ""
              )}>
                {editorMode === "classic" ? (
                  <>
                    <Textarea
                      className="flex-1 border-none focus-visible:ring-0 resize-none p-10 md:p-16 text-lg leading-relaxed font-serif bg-transparent"
                      placeholder={SECTIONS.find(s => s.id === activeSection)?.placeholder}
                      value={editingContent}
                      onChange={e => setEditingContent(e.target.value)}
                    />
                    <EditorImageGallery
                      content={editingContent}
                      onChange={setEditingContent}
                    />
                  </>
                ) : (
                  <>
                    <ParagraphEditor
                      key={activeSection}
                      content={editingContent}
                      onChange={setEditingContent}
                      onExpand={handleExpandParagraph}
                      onAudit={handleAuditParagraph}
                      onFix={handleFixParagraph}
                      projectId={projectId || "default"}
                      activeSection={activeSection}
                    />
                    <EditorImageGallery
                      content={editingContent}
                      onChange={setEditingContent}
                    />
                  </>
                )}
              </div>
            </main>
          </div>
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
      <Dialog open={isMetaDialogOpen} onOpenChange={setIsMetaDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[1040px] max-h-[88vh] overflow-hidden p-0">
          <DialogHeader>
            <div className="px-6 pt-6 pb-4 border-b">
              <DialogTitle>项目设置</DialogTitle>
              <DialogDescription>
                管理论文元数据、投稿模板、摘要、大纲与参考文献。
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto px-6 py-5 max-h-[calc(88vh-136px)]">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
              <section className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
                  <div className="grid gap-2">
                    <Label htmlFor="meta-title">论文题目</Label>
                    <Input
                      id="meta-title"
                      value={tempMeta.title}
                      onChange={(e) => setTempMeta({ ...tempMeta, title: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="meta-template">期刊格式模板</Label>
                    <Select value={tempMeta.template} onValueChange={(val) => setTempMeta({ ...tempMeta, template: val || "sci" })}>
                      <SelectTrigger id="meta-template">
                        <SelectValue placeholder="选择期刊格式" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sci">标准 SCI 格式</SelectItem>
                        <SelectItem value="nature">Nature 官方风格</SelectItem>
                        <SelectItem value="ieee">IEEE 会刊格式</SelectItem>
                        <SelectItem value="gbt7713">GB/T 7713</SelectItem>
                        <SelectItem value="cas">中科院期刊风格</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="meta-authors">作者姓名</Label>
                    <Input
                      id="meta-authors"
                      value={tempMeta.authors}
                      onChange={(e) => setTempMeta({ ...tempMeta, authors: e.target.value })}
                      placeholder="Zhang San, Li Si*"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="meta-affiliations">单位机构信息</Label>
                    <Input
                      id="meta-affiliations"
                      value={tempMeta.affiliations || ""}
                      onChange={(e) => setTempMeta({ ...tempMeta, affiliations: e.target.value })}
                      placeholder="农业科学研究中心，北京 100083"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="meta-keywords">关键词</Label>
                    <Input
                      id="meta-keywords"
                      value={tempMeta.keywords}
                      onChange={(e) => setTempMeta({ ...tempMeta, keywords: e.target.value })}
                      placeholder="农业科技；AI辅助写作；热化学"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="meta-classification">中图分类号</Label>
                    <Input
                      id="meta-classification"
                      value={tempMeta.classification}
                      onChange={(e) => setTempMeta({ ...tempMeta, classification: e.target.value })}
                      placeholder="例如：S-1; TP391"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="meta-research-direction">研究方向 / 主题说明</Label>
                  <Textarea
                    id="meta-research-direction"
                    className="min-h-[92px] resize-y"
                    value={tempMeta.researchDirection}
                    onChange={(e) => setTempMeta({ ...tempMeta, researchDirection: e.target.value })}
                    placeholder="例如：生物质与塑料协同热解、催化升级、碳材料制备..."
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="meta-abstract">摘要 (Abstract)</Label>
                  <Textarea
                    id="meta-abstract"
                    className="min-h-[190px] resize-y"
                    value={tempMeta.abstract}
                    onChange={(e) => setTempMeta({ ...tempMeta, abstract: e.target.value })}
                  />
                </div>
              </section>

              <section className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="meta-outline">论文大纲 / 论证提纲</Label>
                  <Textarea
                    id="meta-outline"
                    className="min-h-[220px] resize-y font-mono text-xs leading-relaxed"
                    value={tempMeta.outline}
                    onChange={(e) => setTempMeta({ ...tempMeta, outline: e.target.value })}
                    placeholder="可粘贴 Markdown 大纲，侧栏扩写会读取这里的任务结构。"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="meta-references">参考文献列表</Label>
                  <Textarea
                    id="meta-references"
                    className="min-h-[220px] resize-y font-mono text-xs leading-relaxed"
                    value={tempMeta.referencesText}
                    onChange={(e) => setTempMeta({ ...tempMeta, referencesText: e.target.value })}
                    placeholder="每行一条参考文献；正文引用重排会按 [n] 重新整理这里。"
                  />
                </div>
              </section>
            </div>
          </div>
          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setIsMetaDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveMeta}>保存更新</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Consistency Check Dialog */}
      <Dialog open={isConsistencyOpen} onOpenChange={setIsConsistencyOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[720px] max-h-[88vh] overflow-hidden p-0">
          <DialogHeader>
            <div className="px-6 pt-6 pb-4 border-b">
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                跨章节一致性检查
              </DialogTitle>
              <DialogDescription>
                检查各章节之间的术语、数据、逻辑及引用一致性
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto px-6 py-5 max-h-[calc(88vh-136px)]">
            {isConsistencyLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">正在逐章对比分析...</p>
              </div>
            ) : consistencyReport ? (
              <div className="space-y-6">
                {/* 总体状态 */}
                <div className={`p-4 rounded-lg border ${
                  consistencyReport.passed
                    ? "bg-green-50 border-green-200"
                    : "bg-amber-50 border-amber-200"
                }`}>
                  <div className="flex items-center gap-3">
                    {consistencyReport.passed ? (
                      <CheckCheck className="h-8 w-8 text-green-500" />
                    ) : (
                      <XCircle className="h-8 w-8 text-amber-500" />
                    )}
                    <div>
                      <p className={`font-bold text-sm ${
                        consistencyReport.passed ? "text-green-700" : "text-amber-700"
                      }`}>
                        {consistencyReport.passed
                          ? "一致性检查通过"
                          : `发现 ${consistencyReport.issues?.length || 0} 个问题`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {consistencyReport.summary || ""}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 问题列表 */}
                {consistencyReport.issues && consistencyReport.issues.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      具体问题
                    </h4>
                    {consistencyReport.issues.map((issue: ConsistencyIssue, idx: number) => (
                      <div key={idx} className={`p-4 rounded-lg border ${
                        issue.severity === "high"
                          ? "bg-red-50 border-red-200"
                          : issue.severity === "medium"
                          ? "bg-amber-50 border-amber-200"
                          : "bg-yellow-50 border-yellow-200"
                      }`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                              issue.severity === "high"
                                ? "bg-red-200 text-red-800"
                                : issue.severity === "medium"
                                ? "bg-amber-200 text-amber-800"
                                : "bg-yellow-200 text-yellow-800"
                            }`}>
                              {issue.severity}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              issue.type === "terminology"
                                ? "bg-blue-100 text-blue-700"
                                : issue.type === "data"
                                ? "bg-purple-100 text-purple-700"
                                : issue.type === "logic"
                                ? "bg-orange-100 text-orange-700"
                                : issue.type === "conclusion"
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-700"
                            }`}>
                              {issue.type === "terminology" ? "术语" :
                               issue.type === "data" ? "数据" :
                               issue.type === "logic" ? "逻辑" :
                               issue.type === "conclusion" ? "结论" : "引用"}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs mt-2 leading-relaxed">{issue.description}</p>
                        {issue.sections && issue.sections.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {issue.sections.map((s, si) => (
                              <span key={si} className="text-[9px] bg-background border px-2 py-0.5 rounded-full text-muted-foreground">
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                        {issue.suggestion && (
                          <p className="text-[11px] mt-2 text-muted-foreground italic border-t pt-2 border-dashed border-current/10">
                            💡 {issue.suggestion}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <AlertTriangle className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">准备执行检查...</p>
              </div>
            )}
          </div>
          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setIsConsistencyOpen(false)}>关闭</Button>
            {consistencyReport && !isConsistencyLoading && (
              <Button variant="default" onClick={handleConsistencyCheck}>
                <RefreshCw className="h-4 w-4 mr-1" /> 重新检查
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </ErrorBoundary>
  );
}
