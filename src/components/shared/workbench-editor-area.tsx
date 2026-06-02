"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Eye, FileSearch, Download, Settings2, FileType,
  AlertTriangle, Database, Sparkles, Send, Loader2, Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditorImageGallery } from "@/components/shared/editor-image-gallery";
import { PipelineTimeline } from "@/components/shared/pipeline-timeline";
import { MarkdownContent } from "@/components/shared/previews/shared";
import type { PipelineStep } from "@/hooks/use-writing-stream";
import type { ProjectData } from "@/contracts/project";
import { getTemplateSections } from "@/lib/template-sections";
import dynamic from "next/dynamic";

const ParagraphEditor = dynamic(
  () => import("@/components/shared/paragraph-editor").then(mod => mod.ParagraphEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">正在加载段落编辑器...</span>
      </div>
    ),
  }
);

interface WritingPreviewData {
  content: string;
  pipelineSteps: PipelineStep[];
  verification: string;
  citationWarnings: { num: number; overlap: number; context: string }[];
  dataClaimWarnings: { claimId: string; claimText: string; found: boolean; citedCorrectly: boolean; issue?: string }[];
  detectedRefs: string[];
  isStreaming: boolean;
  targetSection: string;
  subsectionTitle?: string;
}

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
  onApplyAiOutput?: () => void;
  onCancelAiOutput?: () => void;
  onCleanReferences?: () => void;
  aiPreview?: WritingPreviewData | null;
  projectId: string;
}

export function WorkbenchEditorArea({
  project, activeSection, editingContent, editorMode, rightPanelMode,
  onContentChange, onEditorModeChange, onRightPanelModeChange,
  onOpenMetaDialog, onConsistencyCheck, onReorderReferences,
  onExportDoc, onExportMarkdown, onExportPDF,
  onExpandParagraph, onAuditParagraph, onFixParagraph,
  onApplyAiOutput, onCancelAiOutput, onCleanReferences, aiPreview,
  projectId,
}: WorkbenchEditorAreaProps) {
  // 模板驱动的 section 元数据（label + placeholder）
  const templateDefs = getTemplateSections(project.template || "sci", project.mode);
  const sectionMeta = templateDefs.find(s => s.key === activeSection);
  const sectionLabel = sectionMeta?.label || activeSection;
  const sectionPlaceholder = sectionMeta ? `${sectionMeta.label}内容…` : "";

  // AI 预览模式 — 扩写时中间编辑器显示输出内容
  if (aiPreview) {
    return (
      <div className="flex flex-col h-full bg-[#faf9f6] relative">
        {/* 顶部状态栏 */}
        <header className="h-12 border-b border-[#1a5632]/10 bg-[#1a5632]/5 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2 text-xs text-primary">
            <Sparkles className={cn("h-3.5 w-3.5", aiPreview.isStreaming && "animate-pulse")} />
            <span className="font-semibold">AI 扩写 — {aiPreview.targetSection}{aiPreview.subsectionTitle ? ` › ${aiPreview.subsectionTitle}` : ""}</span>
            {aiPreview.isStreaming && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onCancelAiOutput}>
              取消
            </Button>
            <Button variant="default" size="sm" className="h-7 text-[11px] gap-1" onClick={onApplyAiOutput} disabled={aiPreview.isStreaming}>
              <Send className="h-3 w-3" />
              {aiPreview.isStreaming ? "生成中..." : "应用到编辑器"}
            </Button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* 左侧信息栏 — 管道步骤 + 警告 */}
          <aside className="w-56 border-r border-[#1a5632]/10 bg-white/90 shrink-0 p-3 flex flex-col min-h-0">
            {/* 管道步骤 — 固定顶部 */}
            {aiPreview.pipelineSteps.length > 0 && (
              <div className="shrink-0 mb-3">
                <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1.5">进度</p>
                <PipelineTimeline steps={aiPreview.pipelineSteps} />
              </div>
            )}

            {/* 警告摘要 — 填充剩余空间 */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
              {aiPreview.verification && (
                <details className="text-[10px]" open>
                  <summary className="font-bold text-amber-700 cursor-pointer sticky top-0 bg-card py-1">审稿核查</summary>
                  <p className="mt-1 text-amber-800 whitespace-pre-wrap leading-relaxed">{aiPreview.verification}</p>
                </details>
              )}

              {aiPreview.citationWarnings.length > 0 && (
                <details className="text-[10px]" open>
                  <summary className="font-bold text-red-700 cursor-pointer">引用警告 ({aiPreview.citationWarnings.length})</summary>
                  <ul className="mt-1 space-y-0.5">
                    {aiPreview.citationWarnings.map((w, i) => (
                      <li key={i} className="text-red-700">[{w.num}] 重叠 {w.overlap}%</li>
                    ))}
                  </ul>
                </details>
              )}

              {aiPreview.dataClaimWarnings.length > 0 && (
                <details className="text-[10px]" open>
                  <summary className="font-bold text-orange-700 cursor-pointer">数据警告 ({aiPreview.dataClaimWarnings.length})</summary>
                  <ul className="mt-1 space-y-0.5">
                    {aiPreview.dataClaimWarnings.map((w, i) => (
                      <li key={i} className="text-orange-700">[{w.claimId}] {w.issue || "未引用"}</li>
                    ))}
                  </ul>
                </details>
              )}

              {aiPreview.detectedRefs.length > 0 && (
                <details className="text-[10px]">
                  <summary className="font-bold text-primary/70 cursor-pointer">文献引用 ({aiPreview.detectedRefs.length})</summary>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {aiPreview.detectedRefs.slice(0, 6).map((ref, i) => (
                      <li key={i} className="truncate">{ref}</li>
                    ))}
                    {aiPreview.detectedRefs.length > 6 && <li className="text-primary/50">...还有 {aiPreview.detectedRefs.length - 6} 条</li>}
                  </ul>
                </details>
              )}
            </div>
          </aside>

          {/* 正文区域 — 主体 */}
          <main className="flex-1 overflow-auto p-8 md:p-12 bg-[#faf9f6]">
            <div className="max-w-3xl mx-auto min-h-full">
              {aiPreview.content ? (
                <div className="prose prose-sm max-w-none text-sm leading-relaxed">
                  <MarkdownContent content={aiPreview.content} />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  <span className="text-sm">AI 正在撰写...</span>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#faf9f6] relative">
      <header className="h-14 border-b border-[#1a5632]/10 bg-white/90 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-1.5 rounded-md">
              <FileType className="h-4 w-4 text-primary" />
            </div>
            <span className="font-bold text-sm">{sectionLabel}</span>
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
          <Button variant="outline" size="sm"
            className="h-8 gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
            onClick={onCleanReferences} title="移除正文中未引用的参考文献"
          >
            <Trash2 className="h-3.5 w-3.5" /> 清理文献
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

      <main className="flex-1 overflow-auto p-6 md:p-10 lg:p-16 bg-[#faf9f6]">
        <div className={cn(
          "max-w-4xl mx-auto min-h-full flex flex-col",
          editorMode === "classic" ? "bg-white rounded-2xl shadow-xl border border-[#1a5632]/10 overflow-hidden" : ""
        )}>
          {editorMode === "classic" ? (
            <>
              <Textarea
                className="flex-1 border-none focus-visible:ring-0 resize-none p-10 md:p-16 text-lg leading-relaxed font-serif bg-transparent"
                placeholder={sectionPlaceholder}
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
