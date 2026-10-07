"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ShadowDocumentPreview, ShadowRebuildView } from "@/contracts/shadow-reindex";
import { getAdminShadowPreview, getAdminShadowStatus } from "@/services/admin";
import { Button } from "@/components/ui/button";

interface AdminShadowRebuildPanelProps {
  category: string;
  refreshKey: number;
}

export function AdminShadowRebuildPanel({ category, refreshKey }: AdminShadowRebuildPanelProps) {
  const [view, setView] = useState<ShadowRebuildView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ShadowDocumentPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!category) return;
    let stop = false;
    const load = async () => {
      const result = await getAdminShadowStatus(category);
      if (stop) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setView(result.data);
    };
    void load();
    const timer = setInterval(() => { void load(); }, 3000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [category, refreshKey]);

  const openPreview = async (file: string) => {
    if (!category) return;
    setPreviewFile(file);
    setPreviewLoading(true);
    setPreviewError(null);
    const result = await getAdminShadowPreview(category, file);
    setPreviewLoading(false);
    if (!result.ok) {
      setPreview(null);
      setPreviewError(result.error);
      return;
    }
    setPreview(result.data);
  };

  if (!category) return null;

  const percent = view && view.fileCount > 0 ? Math.min(100, Math.round((view.written / view.fileCount) * 100)) : 0;

  return (
    <div className="rounded-xl border border-[#1a5632]/10 bg-white px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-[#122820]">影子重建 · {category}</p>
        <p className="text-[11px] text-[#6b7c72]">只写入 data/shadow，线上索引和写作检索不变</p>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {view?.running && (
        <p className="text-xs text-[#1a5632]">
          <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
          正在写 {view.written}/{view.fileCount}
          {view.lastFile ? ` · ${view.lastFile}` : ""}
        </p>
      )}
      {view && !view.running && view.activeCategory && view.activeCategory !== category && (
        <p className="text-xs text-[#6b7c72]">另一分类「{view.activeCategory}」正在重建，这一类先等它结束。</p>
      )}
      {view?.finished && (
        <p className="text-xs text-[#1a5632]">这一分类已写完 {view.written} 篇。点下面的文件名对照正文顺序。</p>
      )}
      {view && view.fileCount > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-[#1a5632]/10">
          <div className="h-full bg-[#1a5632]" style={{ width: `${percent}%` }} />
        </div>
      )}
      {view && view.files.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {view.files.map((file) => (
            <Button
              key={file}
              type="button"
              variant={previewFile === file ? "default" : "ghost"}
              size="sm"
              className="h-7 max-w-full truncate text-[10px]"
              onClick={() => void openPreview(file)}
            >
              {file}
            </Button>
          ))}
        </div>
      )}
      {view && !view.running && view.files.length === 0 && (
        <p className="text-xs text-[#6b7c72]">这个分类还没有影子。点右上角「影子重建」后，写完的文献会出现在这里。</p>
      )}
      {previewLoading && <p className="text-xs text-[#6b7c72]">正在读取正文…</p>}
      {previewError && <p className="text-xs text-red-600">{previewError}</p>}
      {preview && previewFile && (
        <div className="space-y-2 border-t border-[#1a5632]/10 pt-3">
          <p className="text-xs text-[#122820]">
            {preview.source || previewFile}
            {" · "}
            {preview.chunkCount} 块
            {preview.keptOldChunks > 0 ? ` · ${preview.keptOldChunks} 块保留旧抽取` : ""}
            {preview.crossColumnPages.length > 0 ? ` · 跨栏页 ${preview.crossColumnPages.join("、")}` : ""}
          </p>
          <p className="text-[11px] text-[#6b7c72]">对照 PDF：英文双栏应先左栏到底，再接右栏。跨栏页仍是旧顺序。</p>
          {preview.samples.map((sample, index) => (
            <pre
              key={`${sample.page}-${index}`}
              className="whitespace-pre-wrap rounded-md bg-[#faf9f6] p-2 text-[11px] leading-5 text-[#122820]"
            >
              {sample.keptOld ? `第 ${sample.page} 页 · 保留旧抽取\n` : `第 ${sample.page} 页\n`}
              {sample.text}
            </pre>
          ))}
          {preview.samples.length === 0 && <p className="text-xs text-[#6b7c72]">这篇没有可用正文。</p>}
        </div>
      )}
    </div>
  );
}
