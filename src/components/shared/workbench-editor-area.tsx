"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Download, FileType,
  AlertTriangle, Database, Sparkles, Send, Loader2, Trash2,
  LayoutGrid, BookMarked, Check, ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditorImageGallery } from "@/components/shared/editor-image-gallery";
import { PipelineTimeline } from "@/components/shared/pipeline-timeline";
import { MarkdownContent, ReferencesSection } from "@/components/shared/previews/shared";
import type { PipelineStep } from "@/hooks/use-writing-stream";
import type { ProjectData } from "@/contracts/project";
import { getTemplateSections } from "@/lib/template-sections";
import { getModeAccent } from "@/lib/mode-theme";
import { ProjectModeBadge } from "@/components/shared/project-mode-badge";
import { siteTheme } from "@/lib/site-theme";
import { getProjectWritingMode } from "@/lib/section-registry";
import { buildPreviewReferencesFromContent } from "@/lib/reference-reorder";
import dynamic from "next/dynamic";
import type { ParagraphSelectionAction } from "@/components/shared/writing/paragraph-selection-toolbar";

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
  onSelectionAction?: (selectedText: string, action: ParagraphSelectionAction) => Promise<string>;
  onApplyAiOutput?: () => void;
  onCancelAiOutput?: () => void;
  onCleanReferences?: () => void;
  aiPreview?: WritingPreviewData | null;
  projectId: string;
}

function WorkbenchEditorToolbar({
  editorMode,
  rightPanelMode,
  onEditorModeChange,
  onRightPanelModeChange,
  onConsistencyCheck,
  onReorderReferences,
  onCleanReferences,
  onExportDoc,
  onExportMarkdown,
  onExportPDF,
}: Pick<
  WorkbenchEditorAreaProps,
  | "editorMode"
  | "rightPanelMode"
  | "onEditorModeChange"
  | "onRightPanelModeChange"
  | "onConsistencyCheck"
  | "onReorderReferences"
  | "onCleanReferences"
  | "onExportDoc"
  | "onExportMarkdown"
  | "onExportPDF"
>) {
  const viewHint = `${editorMode === "classic" ? "经典" : "段落"} · ${rightPanelMode === "preview" ? "预览" : "文献"}`;

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs px-2.5">
              <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">视图</span>
              <span className="text-[10px] text-[#6b7c72] tabular-nums">{viewHint}</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-[10px] text-[#6b7c72] font-normal">编辑模式</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onEditorModeChange("classic")}>
              {editorMode === "classic" ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
              经典模式
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEditorModeChange("paragraph")}>
              {editorMode === "paragraph" ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
              段落模式（推荐）
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-[10px] text-[#6b7c72] font-normal">右侧面板</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onRightPanelModeChange("preview")}>
              {rightPanelMode === "preview" ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
              预览模式
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRightPanelModeChange("reader")}>
              {rightPanelMode === "reader" ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
              文献阅读
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs px-2.5">
              <BookMarked className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">文献</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onConsistencyCheck}>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            一致性检查
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onReorderReferences}>
            <Database className="h-3.5 w-3.5" />
            引用重排
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onCleanReferences}>
            <Trash2 className="h-3.5 w-3.5" />
            清理未引用文献
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs px-2.5">
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">导出</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onExportDoc}>Word (.docx)</DropdownMenuItem>
          <DropdownMenuItem onClick={onExportMarkdown}>Markdown (.md)</DropdownMenuItem>
          <DropdownMenuItem onClick={onExportPDF}>PDF</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => window.print()}>浏览器打印</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function WorkbenchEditorArea({
  project, activeSection, editingContent, editorMode, rightPanelMode,
  onContentChange, onEditorModeChange, onRightPanelModeChange,
  onOpenMetaDialog, onConsistencyCheck, onReorderReferences,
  onExportDoc, onExportMarkdown, onExportPDF,
  onExpandParagraph, onAuditParagraph, onFixParagraph, onSelectionAction,
  onApplyAiOutput, onCancelAiOutput, onCleanReferences, aiPreview,
  projectId,
}: WorkbenchEditorAreaProps) {
  const writingMode = getProjectWritingMode(project.mode);
  const accent = getModeAccent(writingMode);
  // 模板驱动的 section 元数据（label + placeholder）
  const templateDefs = getTemplateSections(project.template || "sci", project.mode);
  const sectionMeta = templateDefs.find(s => s.key === activeSection);
  const sectionLabel = sectionMeta?.label || activeSection;
  const sectionPlaceholder = sectionMeta ? `${sectionMeta.label}内容…` : "";
  const previewReferencesChinese =
    writingMode === "review" || project.template === "gbt7713" || project.template === "cas";

  // AI 预览模式 — 扩写时中间编辑器显示输出内容
  if (aiPreview) {
    const aiPreviewReferences = buildPreviewReferencesFromContent(
      aiPreview.content,
      project.references || [],
      aiPreview.detectedRefs,
    );
    return (
      <div className={cn("flex flex-col h-full relative", siteTheme.bgSoft)}>
        <header className={cn("h-12 border-b flex items-center justify-between px-4 shrink-0", accent.headerTint, accent.borderTint)}>
          <div className={cn("flex items-center gap-2 text-xs", accent.iconText)}>
            <Sparkles className={cn("h-3.5 w-3.5", aiPreview.isStreaming && "animate-pulse")} />
            <span className="font-semibold text-[#122820]">AI 扩写 — {aiPreview.targetSection}{aiPreview.subsectionTitle ? ` › ${aiPreview.subsectionTitle}` : ""}</span>
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
          <aside className={cn("w-56 border-r bg-white/90 shrink-0 p-3 flex flex-col min-h-0", accent.borderTint)}>
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
          <main className={cn("flex-1 overflow-auto p-8 md:p-12", siteTheme.bgSoft)}>
            <div className="max-w-3xl mx-auto min-h-full">
              {aiPreview.content ? (
                <div className="prose prose-sm max-w-none text-sm leading-relaxed">
                  <MarkdownContent content={aiPreview.content} refCount={aiPreviewReferences.length || project.references?.length} />
                  <ReferencesSection references={aiPreviewReferences.length > 0 ? aiPreviewReferences : undefined} isChinese={previewReferencesChinese} />
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
    <div className={cn("flex flex-col h-full relative", siteTheme.bgSoft)}>
      <header className={cn("h-12 border-b bg-white/90 flex items-center justify-between gap-3 px-4 sm:px-5 shrink-0", accent.borderTint)}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn("p-1.5 rounded-lg shrink-0", accent.iconBg)}>
            <FileType className={cn("h-4 w-4", accent.iconText)} />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm text-[#122820] truncate">{sectionLabel}</span>
            <ProjectModeBadge mode={writingMode} />
          </div>
        </div>

        <WorkbenchEditorToolbar
          editorMode={editorMode}
          rightPanelMode={rightPanelMode}
          onEditorModeChange={onEditorModeChange}
          onRightPanelModeChange={onRightPanelModeChange}
          onConsistencyCheck={onConsistencyCheck}
          onReorderReferences={onReorderReferences}
          onCleanReferences={onCleanReferences ?? (() => {})}
          onExportDoc={onExportDoc}
          onExportMarkdown={onExportMarkdown}
          onExportPDF={onExportPDF}
        />
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
                onSelectionAction={onSelectionAction}
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
