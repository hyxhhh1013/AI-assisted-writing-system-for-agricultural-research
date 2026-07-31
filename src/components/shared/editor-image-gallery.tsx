"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { X, ImageIcon, Trash2 } from "lucide-react";

interface EmbeddedImage {
  id: number;
  markdown: string;
  alt: string;
  src: string;
}

interface EditorImageGalleryProps {
  content: string;
  onChange: (newContent: string) => void;
}

/**
 * 匹配 Markdown 图片，两种来源都支持：
 * - base64 内嵌：`![alt](data:image/png;base64,...)`
 * - URL 引用：`![alt](/api/charts/xxx.png)`、`![alt](https://…png)`、相对路径
 * 其中 URL 引用是 Agent generate_chart / 写作流水线 generateFigure 插入的格式。
 */
const IMAGE_MARKDOWN_PATTERN = String.raw`!\[([^\]]*)\]\(((?:data:image\/[^;]+;base64,[^)]+)|(?:(?:https?:\/\/|\/)[^)\s]*\.(?:png|jpe?g|svg|gif|webp|tiff?)(?:\?[^)]*)?))\)`;

/** 从 Markdown 文本中提取所有嵌入图片（供单测导出） */
export function extractImages(content: string): EmbeddedImage[] {
  // 每次新建 regex（带 g 的共享实例会有 lastIndex 残留问题）
  const re = new RegExp(IMAGE_MARKDOWN_PATTERN, "gi");
  const images: EmbeddedImage[] = [];
  let match: RegExpExecArray | null;
  let id = 0;
  while ((match = re.exec(content)) !== null) {
    images.push({
      id: id++,
      markdown: match[0],
      alt: match[1] || "image",
      src: match[2] || "",
    });
  }
  return images;
}

export function EditorImageGallery({ content, onChange }: EditorImageGalleryProps) {
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const images = useMemo(() => extractImages(content), [content]);

  if (images.length === 0) return null;

  const removeImage = (img: EmbeddedImage) => {
    // Remove the markdown image syntax from content
    const newContent = content.replace(img.markdown, "");
    onChange(newContent);
  };

  const removeAll = () => {
    const newContent = content.replace(
      new RegExp(`${IMAGE_MARKDOWN_PATTERN}\\n*`, "gi"),
      "",
    );
    onChange(newContent);
  };

  return (
    <div className="border-t bg-muted/10 px-4 py-2 shrink-0">
      <div className="flex items-center gap-2 mb-1.5">
        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          嵌入图片 ({images.length})
        </span>
        <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 ml-auto text-muted-foreground hover:text-destructive"
          onClick={removeAll}>
          <Trash2 className="h-2.5 w-2.5 mr-0.5" /> 全部移除
        </Button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {images.map((img) => (
          <div key={img.id} className="relative group shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.src}
              alt={img.alt}
              className="h-16 w-auto rounded-md border bg-background cursor-pointer object-cover hover:opacity-80 transition-opacity"
              onClick={() => setPreviewImg(img.src)}
            />
            <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="destructive"
                size="icon"
                className="h-5 w-5 rounded-full"
                onClick={() => removeImage(img)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-[9px] text-muted-foreground mt-0.5 truncate max-w-20">{img.alt}</p>
          </div>
        ))}
      </div>

      {/* Full-screen preview */}
      {previewImg && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewImg} alt="preview" className="max-w-full max-h-[90vh] object-contain rounded-lg" />
            <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-8 w-8 bg-black/50 text-white hover:bg-black/70"
              onClick={() => setPreviewImg(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default EditorImageGallery;
