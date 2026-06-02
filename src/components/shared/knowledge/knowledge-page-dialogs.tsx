"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, CheckCircle2, ExternalLink } from "lucide-react";
import { DIALOG_FORM, DIALOG_FULL } from "@/components/ui/dialog-sizes";
import { KnowledgeMetadataDialog } from "@/components/shared/knowledge/knowledge-metadata-dialog";
import { KnowledgeParseWarningDialog } from "@/components/shared/knowledge/knowledge-parse-warning-dialog";
import type { UseKnowledgeListReturn } from "@/hooks/use-knowledge-list";

interface KnowledgePageDialogsProps {
  router: { push: (href: string) => void };
  kb: UseKnowledgeListReturn;
}

export function KnowledgePageDialogs({ router, kb }: KnowledgePageDialogsProps) {
  const cats = kb.categoryOptions;

  return (
    <>
      <Dialog open={kb.isBatchMoveOpen} onOpenChange={kb.setIsBatchMoveOpen}>
        <DialogContent className={DIALOG_FORM}>
          <DialogHeader>
            <DialogTitle>批量修改分类</DialogTitle>
            <DialogDescription>将选中的 {kb.selectedFiles.length} 个文件移动到新分类。</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="batch-category">目标分类</Label>
            <Select
              value={kb.batchCategoryName === "batch_new" ? "batch_new" : kb.batchCategoryName}
              onValueChange={(v) => {
                if (v === "batch_new") {
                  kb.setBatchCategoryName("batch_new");
                  kb.setBatchNewInput("");
                } else kb.setBatchCategoryName(v || "");
              }}
            >
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="选择目标分类" />
              </SelectTrigger>
              <SelectContent>
                {cats.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
                <SelectItem value="batch_new">+ 新增分类</SelectItem>
              </SelectContent>
            </Select>
            {kb.batchCategoryName === "batch_new" && (
              <Input
                className="mt-2"
                placeholder="输入新分类名称"
                value={kb.batchNewInput}
                onChange={(e) => kb.setBatchNewInput(e.target.value)}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => kb.setIsBatchMoveOpen(false)}>
              取消
            </Button>
            <Button onClick={kb.handleBatchMove} disabled={kb.isBatchProcessing || !kb.batchCategoryName}>
              {kb.isBatchProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              确认移动
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={kb.isUploadOpen} onOpenChange={kb.setIsUploadOpen}>
        <DialogContent className={DIALOG_FORM}>
          <DialogHeader>
            <DialogTitle>上传文献</DialogTitle>
            <DialogDescription>可选择多个 PDF 文件，上传后请手动触发索引重建以供 AI 检索。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="file">PDF 文件（支持多选）</Label>
              <Input
                id="file"
                type="file"
                accept=".pdf"
                multiple
                onChange={(e) => kb.setUploadFiles(Array.from(e.target.files || []))}
              />
              {kb.uploadFiles.length > 0 && (
                <p className="text-xs text-muted-foreground">已选择 {kb.uploadFiles.length} 个文件</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category">所属分类</Label>
              <Select
                value={kb.uploadCategory === "new_upload" ? "new_upload" : kb.uploadCategory}
                onValueChange={(v) => {
                  if (v === "new_upload") {
                    kb.setUploadCategory("new_upload");
                    kb.setUploadNewInput("");
                  } else kb.setUploadCategory(v || "");
                }}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  {cats.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                  <SelectItem value="new_upload">+ 新增分类</SelectItem>
                </SelectContent>
              </Select>
              {kb.uploadCategory === "new_upload" && (
                <Input
                  placeholder="输入新分类名称"
                  value={kb.uploadNewInput}
                  onChange={(e) => kb.setUploadNewInput(e.target.value)}
                />
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="doc-type">文档类型</Label>
              <Select value={kb.uploadDocumentType} onValueChange={(v) => v && kb.setUploadDocumentType(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="选择文档类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paper">论文</SelectItem>
                  <SelectItem value="patent">专利</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => kb.setIsUploadOpen(false)}>
              取消
            </Button>
            <Button onClick={kb.handleUpload} disabled={kb.isUploading || kb.uploadFiles.length === 0}>
              {kb.isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              上传 {kb.uploadFiles.length > 0 ? `(${kb.uploadFiles.length}个)` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!kb.editingFile} onOpenChange={(open) => !open && kb.setEditingFile(null)}>
        <DialogContent className={DIALOG_FORM}>
          <DialogHeader>
            <DialogTitle>修改文献分类</DialogTitle>
            <DialogDescription>变更分类将移动物理文件，这会影响索引中的元数据。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>当前文献</Label>
              <div className="text-sm font-medium p-2 bg-muted rounded-md truncate">{kb.editingFile?.name}</div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-category">目标分类</Label>
              <Select
                value={kb.newCategoryName === "new_cat" ? "new_cat" : kb.newCategoryName}
                onValueChange={(v) => {
                  if (v === "new_cat") {
                    kb.setNewCategoryName("new_cat");
                    kb.setNewCategoryInput("");
                  } else kb.setNewCategoryName(v || "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择新分类" />
                </SelectTrigger>
                <SelectContent>
                  {cats.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                  <SelectItem value="new_cat">+ 新增分类</SelectItem>
                </SelectContent>
              </Select>
              {kb.newCategoryName === "new_cat" && (
                <Input
                  placeholder="输入新分类名称"
                  value={kb.newCategoryInput}
                  onChange={(e) => kb.setNewCategoryInput(e.target.value)}
                />
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-doc-type">文档类型</Label>
              <Select value={kb.editDocumentType} onValueChange={(v) => v && kb.setEditDocumentType(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="选择文档类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paper">论文</SelectItem>
                  <SelectItem value="patent">专利</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => kb.setEditingFile(null)}>
              取消
            </Button>
            <Button onClick={kb.handleUpdateCategory} disabled={kb.isUpdatingCategory}>
              {kb.isUpdatingCategory ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              确认变更
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!kb.snippetFile}
        onOpenChange={(open) => {
          if (!open) kb.setSnippetFile(null);
        }}
      >
        <DialogContent className={DIALOG_FULL}>
          <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
            <DialogTitle className="text-lg truncate pr-8">{kb.snippetFile?.name}</DialogTitle>
            <DialogDescription className="flex items-center gap-3">
              <Badge variant="outline" className="text-xs">
                {kb.snippetFile?.category}
              </Badge>
              <span className="text-xs text-muted-foreground">{kb.snippetFile?.chunkCount} 个匹配片段</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {kb.snippetFile?._snippets?.map((snippet, i) => (
              <div
                key={i}
                className="p-5 rounded-xl bg-muted/30 border border-border/40 hover:border-primary/20 transition-colors"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="secondary" className="text-xs h-6 px-2.5">
                    匹配片段 {i + 1}
                  </Badge>
                </div>
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-foreground/85">{snippet}</p>
              </div>
            ))}
            {(!kb.snippetFile?._snippets || kb.snippetFile._snippets.length === 0) && (
              <p className="text-base text-muted-foreground text-center py-16">暂无可预览的片段</p>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t px-6 py-4 gap-3">
            <Button variant="outline" onClick={() => kb.setSnippetFile(null)}>
              关闭
            </Button>
            <Button
              onClick={() => {
                if (kb.snippetFile) {
                  router.push(`/reader?file=${encodeURIComponent(kb.snippetFile.name)}`);
                }
              }}
            >
              <ExternalLink className="mr-2 h-4 w-4" /> 在阅读器中打开完整文献
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <KnowledgeMetadataDialog
        file={kb.metadataFile}
        open={kb.isMetadataOpen}
        onOpenChange={(open) => {
          kb.setIsMetadataOpen(open);
          if (!open) kb.setMetadataFile(null);
        }}
        onSaved={kb.fetchFiles}
      />

      <KnowledgeParseWarningDialog
        file={kb.parseWarningFile}
        open={kb.isParseWarningOpen}
        onOpenChange={(open) => {
          kb.setIsParseWarningOpen(open);
          if (!open) kb.setParseWarningFile(null);
        }}
        onForceReparse={(fileName) => kb.handleSingleReindex(fileName, { files: [fileName], forceStage1: true })}
      />
    </>
  );
}
