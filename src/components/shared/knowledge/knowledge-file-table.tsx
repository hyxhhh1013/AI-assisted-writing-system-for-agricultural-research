"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  FileText,
  AlertCircle,
  Tag,
  Database,
  MoreVertical,
  Edit3,
  Trash2,
  BookOpen,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getDocumentTypeLabel } from "@/contracts/knowledge";
import { KnowledgeBibSummary } from "@/components/shared/knowledge/knowledge-bib-summary";
import { KnowledgeIndexBadge } from "@/components/shared/knowledge/knowledge-index-badge";
import { KnowledgeIndexActions } from "@/components/shared/knowledge/knowledge-index-actions";
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
            <div className="divide-y">
              {kb.files.map((file) => (
                <div
                  key={file.name}
                  className={`flex flex-col md:flex-row md:items-center p-4 hover:bg-muted/50 transition-colors group relative ${
                    kb.selectedFiles.find((f) => f.name === file.name) ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-center mr-4 shrink-0">
                    <Checkbox
                      checked={!!kb.selectedFiles.find((f) => f.name === file.name)}
                      onCheckedChange={() => kb.toggleSelectFile(file)}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>

                  <div
                    onClick={() => openFile(file)}
                    className="flex flex-col flex-1 min-w-0 mr-4 cursor-pointer"
                  >
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

                  <div className="flex items-center justify-between mt-3 md:mt-0 shrink-0 gap-4 pl-8 md:pl-0">
                    <span className="text-xs text-muted-foreground">{kb.formatSize(file.size)}</span>

                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => kb.openMetadataEditor(file)}>
                          <Edit3 className="mr-2 h-4 w-4" /> 编辑书目信息
                        </DropdownMenuItem>
                        <KnowledgeIndexActions
                          file={file}
                          disabled={kb.isIndexing}
                          onReindex={onReindex}
                          onShowParseWarning={(target) => {
                            kb.setParseWarningFile(target);
                            kb.setIsParseWarningOpen(true);
                          }}
                        />
                        <DropdownMenuItem onClick={() => kb.openEditCategory(file)}>
                          <Tag className="mr-2 h-4 w-4" /> 修改分类/类型
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          render={
                            <Link href={`/reader?file=${encodeURIComponent(file.name)}&tab=analyze`}>
                              <BookOpen className="mr-2 h-4 w-4" /> AI 精读
                            </Link>
                          }
                        />
                        <DropdownMenuItem
                          render={
                            <Link href={`/reader?file=${encodeURIComponent(file.name)}`}>
                              <ExternalLink className="mr-2 h-4 w-4" /> 阅读文献
                            </Link>
                          }
                        />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => kb.handleDeleteFile(file)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> 删除文献
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
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
            <p className="text-sm">尝试调整搜索词或切换分类</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
