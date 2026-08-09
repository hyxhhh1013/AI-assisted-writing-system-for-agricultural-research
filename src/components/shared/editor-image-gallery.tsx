"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  ImageIcon,
  LocateFixed,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listMarkdownImages,
  moveMarkdownImage,
  moveMarkdownImageToCursor,
  moveMarkdownImageToEnd,
  moveMarkdownImageToStart,
} from "@/lib/markdown-image-order";

interface EditorImageGalleryProps {
  content: string;
  onChange: (newContent: string) => void;
  /** 经典编辑器 textarea 的 selectionStart；用于「插到光标处」 */
  cursorOffset?: number | null;
}

/** 从 Markdown 文本中提取所有嵌入图片（供单测导出；兼容旧 import） */
export function extractImages(content: string) {
  return listMarkdownImages(content).map((h) => ({
    id: h.index,
    markdown: h.markdown,
    alt: h.alt,
    src: h.src,
  }));
}

export function EditorImageGallery({
  content,
  onChange,
  cursorOffset = null,
}: EditorImageGalleryProps) {
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const images = useMemo(() => listMarkdownImages(content), [content]);

  if (images.length === 0) return null;

  const removeImage = (index: number) => {
    const hit = images[index];
    if (!hit) return;
    onChange(content.slice(0, hit.blockStart) + content.slice(hit.blockEnd));
  };

  const removeAll = () => {
    let next = content;
    // 从后往前删，避免偏移
    for (let i = images.length - 1; i >= 0; i--) {
      const hit = images[i]!;
      next = next.slice(0, hit.blockStart) + next.slice(hit.blockEnd);
    }
    onChange(next);
  };

  return (
    <div className="shrink-0 border-t bg-muted/10 px-4 py-2">
      <div className="mb-1.5 flex items-center gap-2">
        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
          本节插图 ({images.length})
        </span>
        <span className="text-[9px] text-muted-foreground/80">
          Agent 默认节末落盘，可上移/下移/插到光标
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-5 px-1.5 text-[9px] text-muted-foreground hover:text-destructive"
          onClick={removeAll}
        >
          <Trash2 className="mr-0.5 h-2.5 w-2.5" /> 全部移除
        </Button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {images.map((img, index) => (
          <div key={`${img.src}-${index}`} className="group relative w-[7.5rem] shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.src}
              alt={img.alt}
              className="h-16 w-full cursor-pointer rounded-md border bg-background object-cover transition-opacity hover:opacity-80"
              onClick={() => setPreviewImg(img.src)}
            />
            <div className="absolute top-0.5 right-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                variant="destructive"
                size="icon"
                className="h-5 w-5 rounded-full"
                onClick={() => removeImage(index)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <p className="mt-0.5 truncate text-[9px] text-muted-foreground" title={img.alt}>
              {img.alt || `图${index + 1}`}
            </p>
            <div className="mt-0.5 flex flex-wrap gap-0.5">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-5 w-5"
                title="上移"
                disabled={index === 0}
                onClick={() => onChange(moveMarkdownImage(content, index, -1))}
              >
                <ArrowUp className="h-2.5 w-2.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-5 w-5"
                title="下移"
                disabled={index >= images.length - 1}
                onClick={() => onChange(moveMarkdownImage(content, index, 1))}
              >
                <ArrowDown className="h-2.5 w-2.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-5 w-5"
                title="移到文首附近"
                onClick={() => onChange(moveMarkdownImageToStart(content, index))}
              >
                <ChevronsUp className="h-2.5 w-2.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-5 w-5"
                title="移到节末"
                onClick={() => onChange(moveMarkdownImageToEnd(content, index))}
              >
                <ChevronsDown className="h-2.5 w-2.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-5 w-5"
                title="插到光标处（请先在正文点一下）"
                disabled={cursorOffset == null}
                onClick={() => {
                  if (cursorOffset == null) return;
                  onChange(moveMarkdownImageToCursor(content, index, cursorOffset));
                }}
              >
                <LocateFixed className="h-2.5 w-2.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {previewImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewImg(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImg}
              alt="preview"
              className="max-h-[90vh] max-w-full rounded-lg object-contain"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8 bg-black/50 text-white hover:bg-black/70"
              onClick={() => setPreviewImg(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default EditorImageGallery;
