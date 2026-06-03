"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { KnowledgeFileRecord } from "@/contracts/knowledge";
import { DIALOG_FORM } from "@/components/ui/dialog-sizes";

interface KnowledgeParseWarningDialogProps {
  file: KnowledgeFileRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onForceReparse?: (fileName: string) => void;
}

export function KnowledgeParseWarningDialog({
  file,
  open,
  onOpenChange,
  onForceReparse,
}: KnowledgeParseWarningDialogProps) {
  if (!file) return null;

  const isNoText = file.parseWarning === "no_text";
  const title = isNoText ? "未提取到可索引文本" : "文本提取不完整";
  const description = isNoText
    ? "该 PDF 可能是扫描版或图片型文档，未检测到可检索的文字层。BM25/语义检索将无法命中正文内容。"
    : "该 PDF 仅提取到少量文本，检索效果可能较差。";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_FORM}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-left space-y-2 pt-1">
            <span className="block font-medium text-foreground truncate">{file.name}</span>
            <span className="block">{description}</span>
          </DialogDescription>
        </DialogHeader>
        <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1.5">
          <li>换用带文字层的 PDF（Word/LaTeX 导出，而非扫描件）</li>
          <li>对扫描版先做 OCR，再上传重新索引</li>
          <li>仍可编辑书目信息，用于引用格式化</li>
          <li>可尝试「强制重解析」——若 PDF 已更换为可复制文本版本</li>
        </ul>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            知道了
          </Button>
          {onForceReparse && (
            <Button
              onClick={() => {
                onForceReparse(file.name);
                onOpenChange(false);
              }}
            >
              强制重解析
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
