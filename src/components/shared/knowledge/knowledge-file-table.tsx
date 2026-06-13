"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  FileText,
  AlertCircle,
  Tag,
  Database,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  getDocumentTypeLabel,
  getKnowledgeAuthorLine,
  getKnowledgeDisplayTitle,
  getKnowledgeMetricsLine,
  getKnowledgeVolumeIssueLine,
  normalizeKnowledgeDoiUrl,
} from "@/contracts/knowledge";
import { KnowledgeBibSummary } from "@/components/shared/knowledge/knowledge-bib-summary";
import { KnowledgeIndexBadge } from "@/components/shared/knowledge/knowledge-index-badge";
import { KnowledgeFileRowActions } from "@/components/shared/knowledge/knowledge-file-row-actions";
import type { UseKnowledgeListReturn } from "@/hooks/use-knowledge-list";
import type { KnowledgeFile } from "@/services/knowledge";
import type { ReindexRequest } from "@/contracts/reindex";

interface KnowledgeFileTableProps {
  router: { push: (href: string) => void };
  kb: Pick<
    UseKnowledgeListReturn,
    | "files"
    | "isLoading"
    | "selectedFiles"
    | "toggleSelectFile"
    | "searchType"
    | "setSnippetFile"
    | "formatSize"
    | "openMetadataEditor"
    | "isIndexing"
    | "handleSingleReindex"
    | "setParseWarningFile"
    | "setIsParseWarningOpen"
    | "openEditCategory"
    | "handleDeleteFile"
    | "currentPage"
    | "setCurrentPage"
    | "totalPages"
  >;
}

function MetricsCell({ file }: { file: KnowledgeFile }) {
  const line = getKnowledgeMetricsLine(file.metrics);
  if (line) {
    const year = file.metrics?.impactFactorYear;
    return (
      <span className="text-xs inline-flex items-center gap-1">
        <span>{line}</span>
        {year != null && file.metrics?.impactFactor != null ? (
          <span
            className="text-[10px] leading-none text-muted-foreground border rounded px-1 py-0.5"
            title={`IF 数据年份 ${year}`}
          >
            {year}
          </span>
        ) : null}
      </span>
    );
  }
  const hint = file.bib?.issn || file.bib?.eissn
    ? "已有 ISSN：在 Admin 上传课题组 Excel/CSV 即可显示 IF"
    : file.bib?.doi || file.bib?.journal
      ? "可上传 Excel 按刊名匹配；或运行 OpenAlex 补 ISSN"
      : "待书目补全 DOI/期刊；被引与 2yr 均值可自动 enrichment";
  return (
    <span className="text-xs text-muted-foreground" title={hint}>
      —
    </span>
  );
}

function DoiCell({ file }: { file: KnowledgeFile }) {
  const url = normalizeKnowledgeDoiUrl(file.bib?.doi);
  if (!url) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const label = file.bib?.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "") ?? url;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-primary hover:underline truncate block max-w-[140px]"
      onClick={(e) => e.stopPropagation()}
      title={label}
    >
      {label.length > 28 ? `${label.slice(0, 26)}…` : label}
    </a>
  );
}

function FileRowCard({
  file,
  kb,
  openFile,
  onReindex,
}: {
  file: KnowledgeFile;
  kb: KnowledgeFileTableProps["kb"];
  openFile: (file: KnowledgeFile) => void;
  onReindex: (fileName: string, options: ReindexRequest) => void;
}) {
  const selected = !!kb.selectedFiles.find((f) => f.name === file.name);

  return (
    <div
      className={`flex flex-col p-4 hover:bg-muted/50 transition-colors group relative ${
        selected ? "bg-primary/5" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={() => kb.toggleSelectFile(file)}
          className="mt-1 data-[state=checked]:bg-primary"
        />
        <div onClick={() => openFile(file)} className="flex flex-col flex-1 min-w-0 cursor-pointer">
          <div className="flex items-center min-w-0">
            <div className="p-2 rounded bg-primary/10 mr-3 shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <KnowledgeBibSummary file={file} />
          </div>
          <div className="flex items-center gap-2 mt-1.5 pl-10 flex-wrap">
            <span className="flex items-center text-xs text-muted-foreground">
              <Tag className="mr-1 h-3 w-3" />
              {file.category}
            </span>
            <Badge variant="outline" className="text-xs py-0 px-1.5">
              {getDocumentTypeLabel(file.documentType || "paper")}
            </Badge>
            <KnowledgeIndexBadge file={file} />
            <span className="flex items-center text-xs text-muted-foreground">
              <Database className="mr-1 h-3 w-3" />
              {file.chunkCount} 块
            </span>
          </div>
          {file._snippets && file._snippets.length > 0 && (
            <div className="mt-2 space-y-1.5 pl-10">
              {file._snippets.map((s, i) => (
                <p
                  key={i}
                  className="text-xs text-muted-foreground line-clamp-2 italic border-l-2 border-primary/30 pl-2.5 py-0.5"
                >
                  {s}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{kb.formatSize(file.size)}</span>
          <KnowledgeFileRowActions
            file={file}
            isIndexing={kb.isIndexing}
            onReindex={onReindex}
            onEditMetadata={kb.openMetadataEditor}
            onEditCategory={kb.openEditCategory}
            onDelete={kb.handleDeleteFile}
            onShowParseWarning={(target) => {
              kb.setParseWarningFile(target);
              kb.setIsParseWarningOpen(true);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function FileTableDesktop({
  file,
  kb,
  openFile,
  onReindex,
}: {
  file: KnowledgeFile;
  kb: KnowledgeFileTableProps["kb"];
  openFile: (file: KnowledgeFile) => void;
  onReindex: (fileName: string, options: ReindexRequest) => void;
}) {
  const title = getKnowledgeDisplayTitle(file);
  const author = getKnowledgeAuthorLine(file);
  const volLine = getKnowledgeVolumeIssueLine(file.bib);
  const selected = !!kb.selectedFiles.find((f) => f.name === file.name);

  return (
    <tr className={`border-b hover:bg-muted/40 transition-colors ${selected ? "bg-primary/5" : ""}`}>
      <td className="p-3 w-10">
        <Checkbox
          checked={selected}
          onCheckedChange={() => kb.toggleSelectFile(file)}
          className="data-[state=checked]:bg-primary"
        />
      </td>
      <td className="p-3 min-w-[200px] max-w-[280px]">
        <button
          type="button"
          onClick={() => openFile(file)}
          className="text-left w-full group/title"
        >
          <p className="font-medium text-sm truncate group-hover/title:text-primary transition-colors">
            {title}
          </p>
          {author && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{author}</p>
          )}
          {file.bibEdited && (
            <Badge variant="outline" className="text-[10px] py-0 px-1 mt-1 border-amber-400 text-amber-700">
              已校正
            </Badge>
          )}
        </button>
      </td>
      <td className="p-3 text-xs max-w-[160px]">
        <span className="line-clamp-2" title={file.bib?.journal ?? undefined}>
          {file.bib?.journal?.trim() || "—"}
        </span>
      </td>
      <td className="p-3 text-xs text-center w-14 whitespace-nowrap">
        {file.bib?.year ?? "—"}
      </td>
      <td className="p-3 text-xs max-w-[100px]">
        <span className="truncate block" title={volLine ?? undefined}>
          {volLine || "—"}
        </span>
      </td>
      <td className="p-3 max-w-[150px]">
        <DoiCell file={file} />
      </td>
      <td className="p-3 max-w-[120px]">
        <MetricsCell file={file} />
      </td>
      <td className="p-3 w-24">
        <KnowledgeIndexBadge file={file} />
      </td>
      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
        {file.chunkCount} 块
      </td>
      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
        {kb.formatSize(file.size)}
      </td>
      <td className="p-3 w-10">
        <KnowledgeFileRowActions
          file={file}
          isIndexing={kb.isIndexing}
          onReindex={onReindex}
          onEditMetadata={kb.openMetadataEditor}
          onEditCategory={kb.openEditCategory}
          onDelete={kb.handleDeleteFile}
          onShowParseWarning={(target) => {
            kb.setParseWarningFile(target);
            kb.setIsParseWarningOpen(true);
          }}
        />
      </td>
    </tr>
  );
}

export function KnowledgeFileTable({ router, kb }: KnowledgeFileTableProps) {
  const onReindex = (fileName: string, options: ReindexRequest) => {
    kb.handleSingleReindex(fileName, options);
  };

  const openFile = (file: KnowledgeFile) => {
    if (kb.searchType === "semantic" && file._snippets?.length) {
      kb.setSnippetFile(file);
    } else {
      router.push(`/reader?file=${encodeURIComponent(file.name)}`);
    }
  };

  return (
    <Card>
      <CardContent className="p-0">
        {kb.isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : kb.files.length > 0 ? (
          <>
            <div className="lg:hidden divide-y">
              {kb.files.map((file) => (
                <FileRowCard
                  key={file.name}
                  file={file}
                  kb={kb}
                  openFile={openFile}
                  onReindex={onReindex}
                />
              ))}
            </div>

            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <th className="p-3 w-10" />
                    <th className="p-3 text-left font-medium">标题 / 作者</th>
                    <th className="p-3 text-left font-medium">期刊</th>
                    <th className="p-3 text-center font-medium">年</th>
                    <th className="p-3 text-left font-medium">卷(期)</th>
                    <th className="p-3 text-left font-medium">DOI</th>
                    <th className="p-3 text-left font-medium">指标</th>
                    <th className="p-3 text-left font-medium">索引</th>
                    <th className="p-3 text-left font-medium">块数</th>
                    <th className="p-3 text-left font-medium">大小</th>
                    <th className="p-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {kb.files.map((file) => (
                    <FileTableDesktop
                      key={file.name}
                      file={file}
                      kb={kb}
                      openFile={openFile}
                      onReindex={onReindex}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {kb.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-4 border-t">
                <div className="text-xs text-muted-foreground">
                  第 {kb.currentPage} 页 / 共 {kb.totalPages} 页
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => kb.setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={kb.currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> 上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => kb.setCurrentPage((p) => Math.min(kb.totalPages, p + 1))}
                    disabled={kb.currentPage === kb.totalPages}
                  >
                    下一页 <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mb-4 opacity-20" />
            <p className="text-lg font-medium">未找到匹配的文献</p>
            <p className="text-sm">尝试调整搜索词、分类或书目筛选</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
