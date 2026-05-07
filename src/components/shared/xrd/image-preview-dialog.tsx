"use client";

import { Button } from "@/components/ui/button";
import { Download, FileText, X } from "lucide-react";

export interface PreviewImage {
  src: string;
  caption: string;
}

interface ImagePreviewDialogProps {
  preview: PreviewImage | null;
  onClose: () => void;
  onInsertToPaper: (imageUrl: string, caption: string) => void;
}

export function ImagePreviewDialog({ preview, onClose, onInsertToPaper }: ImagePreviewDialogProps) {
  if (!preview) return null;

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = preview.src;
    link.download = `${preview.caption.replace(/[^a-zA-Z0-9一-鿿]/g, "_")}.png`;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col bg-background rounded-lg overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2 border-b bg-card shrink-0">
          <span className="text-sm font-medium truncate mr-4">{preview.caption}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5 mr-1" /> 下载
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs"
              onClick={() => { onInsertToPaper(preview.src, preview.caption); onClose(); }}>
              <FileText className="h-3.5 w-3.5 mr-1" /> 插入论文
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="overflow-auto p-2 flex items-center justify-center bg-muted/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.src} alt={preview.caption} className="max-w-full max-h-[80vh] object-contain" />
        </div>
      </div>
    </div>
  );
}
