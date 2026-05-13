"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Eye, FileSearch, Download, Settings2, FileType,
  AlertTriangle, Database,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditorImageGallery } from "@/components/shared/editor-image-gallery";
import { ProjectData } from "@/lib/store";
import dynamic from "next/dynamic";

const ParagraphEditor = dynamic(
  () => import("@/components/shared/paragraph-editor").then(mod => mod.ParagraphEditor),
  { ssr: false }
);

const SECTIONS = [
  { id: "abstract", label: "Abstract", placeholder: "摘要内容..." },
  { id: "introduction", label: "1. Introduction", placeholder: "引言部分..." },
  { id: "methods", label: "2. Materials and Methods", placeholder: "材料与方法..." },
  { id: "results", label: "3. Results and Discussion", placeholder: "结果与讨论..." },
  { id: "conclusion", label: "4. Conclusion", placeholder: "结论部分..." },
];

interface WorkbenchEditorAreaProps {
  project: ProjectData;
  activeSection: string;
  editingContent: string;
  editorMode: "classic" | "paragraph";
  rightPanelMode: "preview" | "reader";
  onContentChange: (content: string) => void;
  onEditorModeChange: (mode: "classic" | "paragraph") => void;
  onRightPanelModeChange: (mode: "preview" | "reader") => void;
  onOpenMetaDialog: () => void;
  onConsistencyCheck: () => void;
  onReorderReferences: () => void;
  onExportDoc: () => void;
  onExportMarkdown: () => void;
  onExportPDF: () => void;
  onExpandParagraph?: (content: string) => Promise<string>;
  onAuditParagraph?: (content: string) => Promise<string>;
  onFixParagraph?: (content: string, feedback: string) => Promise<string>;
  projectId: string;
}

export function WorkbenchEditorArea({
  project, activeSection, editingContent, editorMode, rightPanelMode,
  onContentChange, onEditorModeChange, onRightPanelModeChange,
  onOpenMetaDialog, onConsistencyCheck, onReorderReferences,
  onExportDoc, onExportMarkdown, onExportPDF,
  onExpandParagraph, onAuditParagraph, onFixParagraph,
  projectId,
}: WorkbenchEditorAreaProps) {
  const section = SECTIONS.find(s => s.id === activeSection);

  return (
    <div className="flex flex-col h-full bg-background relative">
      <header className="h-14 border-b bg-card flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-1.5 rounded-md">
              <FileType className="h-4 w-4 text-primary" />
            </div>
            <span className="font-bold text-sm">{section?.label || activeSection}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted rounded-md p-0.5">
            <Button
              variant={editorMode === "classic" ? "secondary" : "ghost"}
              size="sm" className="h-7 text-[10px] px-2"
              onClick={() => onEditorModeChange("classic")}
            >经典模式</Button>
            <Button
              variant={editorMode === "paragraph" ? "secondary" : "ghost"}
              size="sm" className="h-7 text-[10px] px-2"
              onClick={() => onEditorModeChange("paragraph")}
            >段落模式</Button>
          </div>

          <div className="h-4 w-px bg-border mx-1" />

          <div className="flex items-center bg-muted rounded-md p-0.5">
            <Button
              variant={rightPanelMode === "preview" ? "secondary" : "ghost"}
              size="sm" className="h-7 text-[10px] px-2"
              onClick={() => onRightPanelModeChange("preview")}
            >预览模式</Button>
            <Button
              variant={rightPanelMode === "reader" ? "secondary" : "ghost"}
              size="sm" className="h-7 text-[10px] px-2"
              onClick={() => onRightPanelModeChange("reader")}
            >文献阅读</Button>
          </div>

          <div className="h-4 w-px bg-border mx-1" />

          <Button variant="outline" size="sm"
            className="h-8 gap-1.5 text-xs text-amber-600 border-amber-300 hover:bg-amber-50"
            onClick={onConsistencyCheck} title="检查各章节之间的术语、数据、逻辑一致性"
          >
            <AlertTriangle className="h-3.5 w-3.5" /> 一致性检查
          </Button>
          <Button variant="outline" size="sm"
            className="h-8 gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/5"
            onClick={onReorderReferences} title="根据正文引用顺序自动排列文献列表"
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
              <DropdownMenuItem onClick={onExportDoc}>Word 文档 (.docx)</DropdownMenuItem>
              <DropdownMenuItem onClick={onExportMarkdown}>Markdown 文件 (.md)</DropdownMenuItem>
              <DropdownMenuItem onClick={onExportPDF}>导出 PDF</DropdownMenuItem>
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
                placeholder={section?.placeholder || ""}
                value={editingContent}
                onChange={e => onContentChange(e.target.value)}
              />
              <EditorImageGallery content={editingContent} onChange={onContentChange} />
            </>
          ) : (
            <>
              <ParagraphEditor
                key={activeSection}
                content={editingContent}
                onChange={onContentChange}
                onExpand={onExpandParagraph}
                onAudit={onAuditParagraph}
                onFix={onFixParagraph}
                projectId={projectId || "default"}
                activeSection={activeSection}
              />
              <EditorImageGallery content={editingContent} onChange={onContentChange} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
