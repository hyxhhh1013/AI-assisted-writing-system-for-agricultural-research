"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { 
  Loader2, RefreshCw, FileText,
  CheckCircle2, AlertCircle, ExternalLink, 
  Search, Tag, Calendar, Database, Upload,
  MoreVertical, Edit3, Trash2, CheckSquare, Square,
  ChevronLeft, ChevronRight, BookOpen
} from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, DialogContent, DialogHeader, 
  DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { 
  Select, SelectContent, SelectItem, 
  SelectTrigger, SelectValue 
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { siteTheme } from "@/lib/site-theme";
import {
  reindexKnowledgeStream,
  searchKnowledge,
  uploadKnowledgeFile,
  updateFileCategory,
  batchMoveFiles,
  deleteKnowledgeFile,
  batchDeleteKnowledgeFiles,
  type KnowledgeFile,
  type ReindexKnowledgeOptions,
} from "@/services/knowledge";
import {
  applyReindexEvent,
  INITIAL_REINDEX_PROGRESS,
  type ReindexProgressState,
  type ReindexRequest,
} from "@/contracts/reindex";
import { getDocumentTypeLabel } from "@/contracts/knowledge";
import { KnowledgeBibSummary } from "@/components/shared/knowledge/knowledge-bib-summary";
import { KnowledgeIndexBadge } from "@/components/shared/knowledge/knowledge-index-badge";
import { KnowledgeMetadataDialog } from "@/components/shared/knowledge/knowledge-metadata-dialog";
import { KnowledgeIndexActions } from "@/components/shared/knowledge/knowledge-index-actions";
import { KnowledgeParseWarningDialog } from "@/components/shared/knowledge/knowledge-parse-warning-dialog";
import { DIALOG_FORM, DIALOG_FULL } from "@/components/ui/dialog-sizes";

export default function KnowledgePage() {
  const router = useRouter();
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [categories, setCategories] = useState<string[]>(["全部"]);
  const [isLoading, setIsLoading] = useState(true);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState<ReindexProgressState>(INITIAL_REINDEX_PROGRESS);
  const reindexAbortRef = useRef<AbortController | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [searchType, setSearchType] = useState<"name" | "semantic">("name");
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalFiles, setTotalFiles] = useState(0);

  // 多选与批量操作状态
  const [selectedFiles, setSelectedFiles] = useState<KnowledgeFile[]>([]);
  const [selectAllPages, setSelectAllPages] = useState(false);
  const [isBatchMoveOpen, setIsBatchMoveOpen] = useState(false);
  const [batchCategoryName, setBatchCategoryName] = useState("");
  const [batchNewInput, setBatchNewInput] = useState("");
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // 上传相关状态
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadCategory, setUploadCategory] = useState("未分类");
  const [uploadDocumentType, setUploadDocumentType] = useState("paper");
  const [uploadNewInput, setUploadNewInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // 修改分类相关状态
  const [editingFile, setEditingFile] = useState<KnowledgeFile | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [editDocumentType, setEditDocumentType] = useState("paper");
  const [isUpdatingCategory, setIsUpdatingCategory] = useState(false);

  // 片段预览弹窗
  const [snippetFile, setSnippetFile] = useState<KnowledgeFile | null>(null);

  // 书目编辑
  const [metadataFile, setMetadataFile] = useState<KnowledgeFile | null>(null);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);

  // 解析告警说明
  const [parseWarningFile, setParseWarningFile] = useState<KnowledgeFile | null>(null);
  const [isParseWarningOpen, setIsParseWarningOpen] = useState(false);

  const fetchFiles = async () => {
    setIsLoading(true);
    try {
      const data = await searchKnowledge({
        q: searchQuery || undefined,
        category: selectedCategory !== "全部" ? selectedCategory : undefined,
        type: searchType,
        page: currentPage,
        pageSize,
      });
      if (data.files) setFiles(data.files);
      if (data.total !== undefined) setTotalFiles(data.total);
      if (data.categories) setCategories(data.categories);
      setSelectedFiles([]);
    } catch {
      toast.error("获取文献列表失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchFiles();
    }, 300); // 防抖
    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory, currentPage, searchType]);

  // 当搜索或分类改变时，重置页码
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, searchType]);

  const runReindex = async (options?: ReindexKnowledgeOptions, startMessage?: string) => {
    if (isIndexing) return;

    reindexAbortRef.current?.abort();
    const controller = new AbortController();
    reindexAbortRef.current = controller;

    setIsIndexing(true);
    setIndexProgress(INITIAL_REINDEX_PROGRESS);
    toast.info(startMessage || "正在重新扫描并索引文献…");

    try {
      await reindexKnowledgeStream((event) => {
        setIndexProgress((prev) => applyReindexEvent(prev, event));
      }, controller.signal, options);

      toast.success("本地知识库索引已更新！");
      fetchFiles();
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        toast.info("索引任务已取消");
      } else {
        toast.error(error instanceof Error ? error.message : "操作失败");
      }
    } finally {
      setIsIndexing(false);
      reindexAbortRef.current = null;
    }
  };

  const handleReindex = () => {
    void runReindex();
  };

  const handleSingleReindex = (fileName: string, options: ReindexRequest) => {
    const label = options.forceStage1
      ? "强制重解析"
      : options.forceStage3
        ? "强制重嵌向量"
        : "重新索引";
    void runReindex({ ...options, files: [fileName] }, `正在${label}：${fileName}`);
  };

  const handleCancelReindex = () => {
    reindexAbortRef.current?.abort();
  };

  const toggleSelectAll = () => {
    if (selectedFiles.length === files.length || selectAllPages) {
      setSelectedFiles([]);
      setSelectAllPages(false);
    } else {
      setSelectedFiles([...files]);
    }
  };

  const selectAllAcrossPages = async () => {
    try {
      const data = await searchKnowledge({
        q: searchQuery || undefined,
        category: selectedCategory !== "全部" ? selectedCategory : undefined,
        type: searchType,
        pageSize: totalFiles,
      });
      if (data.files) {
        setSelectedFiles(data.files);
        setSelectAllPages(true);
      }
    } catch {
      toast.error("全选失败");
    }
  };

  const toggleSelectFile = (file: KnowledgeFile) => {
    setSelectedFiles(prev => 
      prev.find(f => f.name === file.name)
        ? prev.filter(f => f.name !== file.name)
        : [...prev, file]
    );
  };

  const handleBatchMove = async () => {
    const catName = batchCategoryName === "batch_new" ? batchNewInput : batchCategoryName;
    if (selectedFiles.length === 0 || !catName) return;
    setIsBatchProcessing(true);

    try {
      const message = await batchMoveFiles(
        selectedFiles.map((f) => ({ name: f.name, category: f.category })),
        catName,
      );
      toast.success(message);
      setIsBatchMoveOpen(false);
      fetchFiles();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedFiles.length === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedFiles.length} 个文件吗？此操作不可撤销。`)) return;
    
    setIsBatchProcessing(true);
    try {
      const message = await batchDeleteKnowledgeFiles(
        selectedFiles.map((f) => ({ name: f.name, category: f.category })),
      );
      toast.success(message);
      fetchFiles();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleDeleteFile = async (file: KnowledgeFile) => {
    if (!confirm(`确定要删除文件 "${file.name}" 吗？`)) return;

    try {
      await deleteKnowledgeFile(file.name, file.category);
      toast.success("文件已删除");
      fetchFiles();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) return;
    const catName = uploadCategory === "new_upload" ? uploadNewInput : uploadCategory;
    if (!catName) {
      toast.error("请输入分类名称");
      return;
    }
    setIsUploading(true);
    let successCount = 0;
    for (const file of uploadFiles) {
      try {
        await uploadKnowledgeFile(file, catName, uploadDocumentType);
        successCount++;
      } catch (e) {
        console.error(`上传失败: ${file.name}`, e);
      }
    }

    toast.success(`上传完成：${successCount}/${uploadFiles.length} 个文件`);
    setIsUploadOpen(false);
    setUploadFiles([]);
    fetchFiles();
    setIsUploading(false);
  };

  const handleUpdateCategory = async () => {
    const catName = newCategoryName === "new_cat" ? newCategoryInput : newCategoryName;
    if (!editingFile || !catName) return;
    setIsUpdatingCategory(true);

    try {
      await updateFileCategory(
        editingFile.name,
        editingFile.category,
        catName,
        editDocumentType,
      );
      toast.success("分类更新成功！");
      setEditingFile(null);
      fetchFiles();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setIsUpdatingCategory(false);
    }
  };

  const openMetadataEditor = (file: KnowledgeFile) => {
    setMetadataFile(file);
    setIsMetadataOpen(true);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalPages = Math.ceil(totalFiles / pageSize);

  return (
    <>
      <PageHeader
        title="知识库管理"
        subtitle="集成检索与分类功能，支持高效管理海量实验室私有文献"
        icon={Database}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="border-[#1a5632]/20" onClick={() => setIsUploadOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> 上传文献
            </Button>
            <Button onClick={handleReindex} disabled={isIndexing} className={`shrink-0 ${siteTheme.btnPrimary}`}>
              {isIndexing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              重新构建索引
            </Button>
          </div>
        }
      />

      <div className="space-y-6">
        {isIndexing && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <span className="text-sm font-medium">{indexProgress.phase || "正在构建索引…"}</span>
                  {indexProgress.currentFile && (
                    <p className="text-xs text-muted-foreground truncate">
                      当前文件：{indexProgress.currentFile}
                    </p>
                  )}
                  {indexProgress.totalFiles > 0 && (
                    <p className="text-xs text-muted-foreground">
                      文献进度 {indexProgress.processedFiles}/{indexProgress.totalFiles}
                      {indexProgress.unchangedCount > 0 && ` · ${indexProgress.unchangedCount} 个跳过`}
                      {indexProgress.changedCount > 0 && ` · ${indexProgress.changedCount} 个需更新`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-mono text-muted-foreground">
                    {indexProgress.percent}%
                  </span>
                  <Button variant="outline" size="sm" onClick={handleCancelReindex}>
                    取消
                  </Button>
                </div>
              </div>
              <Progress value={indexProgress.percent} className="h-2" />
              {indexProgress.logs.length > 0 && (
                <div className="rounded-md border bg-background/70 p-3 max-h-48 overflow-y-auto">
                  <ul className="space-y-1 text-xs text-muted-foreground font-mono">
                    {indexProgress.logs.map((line, i) => (
                      <li key={`${line}-${i}`}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 批量操作工具栏 */}
        {selectedFiles.length > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center justify-between sticky top-4 z-10 shadow-sm backdrop-blur-sm animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold text-primary">
                已选中 {selectedFiles.length} 项
              </span>
              <div className="h-4 w-px bg-primary/20" />
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-xs h-8"
                onClick={() => setIsBatchMoveOpen(true)}
              >
                <Tag className="mr-2 h-3.5 w-3.5" /> 批量分类
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleBatchDelete}
                disabled={isBatchProcessing}
              >
                {isBatchProcessing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-2 h-3.5 w-3.5" />}
                批量删除
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedFiles([])}>取消选择</Button>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-4 items-end md:items-center">
          <div className="relative flex-1 w-full flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={searchType === "semantic" ? "搜索文献内容（语义检索）..." : "搜索文件名或分类..."}
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button
              variant={searchType === "semantic" ? "default" : "outline"}
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => setSearchType(searchType === "semantic" ? "name" : "semantic")}
              title={searchType === "semantic" ? "切换到文件名搜索" : "切换到内容语义搜索"}
            >
              <FileText className="h-3.5 w-3.5" />
              {searchType === "semantic" ? "语义" : "文件名"}
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
            <Database className="h-4 w-4" />
            共 {totalFiles} 篇文献
          </div>
        </div>

        <div className="w-full">
          <div className="flex items-center justify-between mb-4 overflow-x-auto gap-4">
            <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="bg-muted/50 rounded-lg p-1">
              <TabsList className="bg-transparent">
                {categories.map(cat => (
                  <TabsTrigger key={cat} value={cat} className="px-4">
                    {cat}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            
            <div className="flex items-center gap-2 shrink-0">
              {selectAllPages ? (
                <Button variant="ghost" size="sm" className="text-xs h-8 gap-2" onClick={toggleSelectAll}>
                  <CheckSquare className="h-3.5 w-3.5" /> 取消全选（{totalFiles} 篇）
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" className="text-xs h-8 gap-2" onClick={toggleSelectAll}>
                    {selectedFiles.length === files.length && files.length > 0 ? (
                      <><CheckSquare className="h-3.5 w-3.5" /> 取消全选</>
                    ) : (
                      <><Square className="h-3.5 w-3.5" /> 全选本页</>
                    )}
                  </Button>
                  {totalPages > 1 && (
                    <Button variant="ghost" size="sm" className="text-xs h-8 gap-1 text-muted-foreground" onClick={selectAllAcrossPages}>
                      <Square className="h-3 w-3" /> 全选所有 {totalFiles} 篇
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : files.length > 0 ? (
                <>
                  <div className="divide-y">
                    {files.map((file) => (
                      <div
                        key={file.name}
                        className={`flex flex-col md:flex-row md:items-center p-4 hover:bg-muted/50 transition-colors group relative ${
                          selectedFiles.find(f => f.name === file.name) ? "bg-primary/5" : ""
                        }`}
                      >
                        <div className="flex items-center mr-4 shrink-0">
                          <Checkbox 
                            checked={!!selectedFiles.find(f => f.name === file.name)}
                            onCheckedChange={() => toggleSelectFile(file)}
                            className="data-[state=checked]:bg-primary"
                          />
                        </div>

                        <div
                          onClick={() => {
                            if (searchType === "semantic" && file._snippets?.length) {
                              setSnippetFile(file);
                            } else {
                              router.push(`/reader?file=${encodeURIComponent(file.name)}`);
                            }
                          }}
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
                                <p key={i} className="text-xs text-muted-foreground line-clamp-2 italic border-l-2 border-primary/30 pl-2.5 py-0.5">
                                  {s}
                                </p>
                              ))}
                            </div>
                          )}
                      </div>

                      <div className="flex items-center justify-between mt-3 md:mt-0 shrink-0 gap-4 pl-8 md:pl-0">
                          <span className="text-xs text-muted-foreground">
                            {formatSize(file.size)}
                          </span>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger render={
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            } />
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openMetadataEditor(file)}>
                                <Edit3 className="mr-2 h-4 w-4" /> 编辑书目信息
                              </DropdownMenuItem>
                              <KnowledgeIndexActions
                                file={file}
                                disabled={isIndexing}
                                onReindex={handleSingleReindex}
                                onShowParseWarning={(target) => {
                                  setParseWarningFile(target);
                                  setIsParseWarningOpen(true);
                                }}
                              />
                              <DropdownMenuItem onClick={() => {
                                setEditingFile(file);
                                setNewCategoryName(file.category);
                                setEditDocumentType(file.documentType === "journal" ? "paper" : (file.documentType || "paper"));
                              }}>
                                <Tag className="mr-2 h-4 w-4" /> 修改分类/类型
                              </DropdownMenuItem>
                              <DropdownMenuItem render={
                                <Link href={`/reader?file=${encodeURIComponent(file.name)}&tab=analyze`}>
                                  <BookOpen className="mr-2 h-4 w-4" /> AI 精读
                                </Link>
                              } />
                              <DropdownMenuItem render={
                                <Link href={`/reader?file=${encodeURIComponent(file.name)}`}>
                                  <ExternalLink className="mr-2 h-4 w-4" /> 阅读文献
                                </Link>
                              } />
                              <DropdownMenuItem 
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleDeleteFile(file)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> 删除文献
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* 分页控制 */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-4 border-t">
                      <div className="text-xs text-muted-foreground">
                        第 {currentPage} 页 / 共 {totalPages} 页
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" /> 上一页
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
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
        </div>
      </div>

      {/* 批量移动分类对话框 */}
      <Dialog open={isBatchMoveOpen} onOpenChange={setIsBatchMoveOpen}>
        <DialogContent className={DIALOG_FORM}>
          <DialogHeader>
            <DialogTitle>批量修改分类</DialogTitle>
            <DialogDescription>
              将选中的 {selectedFiles.length} 个文件移动到新分类。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="batch-category">目标分类</Label>
            <Select value={batchCategoryName === "batch_new" ? "batch_new" : batchCategoryName} onValueChange={(v) => {
              if (v === "batch_new") { setBatchCategoryName("batch_new"); setBatchNewInput(""); }
              else setBatchCategoryName(v || "");
            }}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="选择目标分类" />
              </SelectTrigger>
              <SelectContent>
                {categories.filter(c => c !== "全部").map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
                <SelectItem value="batch_new">+ 新增分类</SelectItem>
              </SelectContent>
            </Select>
            {batchCategoryName === "batch_new" && (
              <Input
                className="mt-2"
                placeholder="输入新分类名称"
                value={batchNewInput}
                onChange={(e) => setBatchNewInput(e.target.value)}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBatchMoveOpen(false)}>取消</Button>
            <Button onClick={handleBatchMove} disabled={isBatchProcessing || !batchCategoryName}>
              {isBatchProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              确认移动
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 上传文献对话框 */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className={DIALOG_FORM}>
          <DialogHeader>
            <DialogTitle>上传文献</DialogTitle>
            <DialogDescription>
              可选择多个 PDF 文件，上传后请手动触发索引重建以供 AI 检索。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="file">PDF 文件（支持多选）</Label>
              <Input
                id="file"
                type="file"
                accept=".pdf"
                multiple
                onChange={(e) => setUploadFiles(Array.from(e.target.files || []))}
              />
              {uploadFiles.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  已选择 {uploadFiles.length} 个文件
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category">所属分类</Label>
              <div className="flex gap-2">
                <Select value={uploadCategory === "new_upload" ? "new_upload" : uploadCategory} onValueChange={(v) => {
                  if (v === "new_upload") { setUploadCategory("new_upload"); setUploadNewInput(""); }
                  else setUploadCategory(v || "");
                }}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="选择分类" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.filter(c => c !== "全部").map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                    <SelectItem value="new_upload">+ 新增分类</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {uploadCategory === "new_upload" && (
                <Input
                  placeholder="输入新分类名称"
                  value={uploadNewInput}
                  onChange={(e) => setUploadNewInput(e.target.value)}
                />
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="doc-type">文档类型</Label>
              <Select value={uploadDocumentType} onValueChange={(v) => v && setUploadDocumentType(v)}>
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
            <Button variant="outline" onClick={() => setIsUploadOpen(false)}>取消</Button>
            <Button onClick={handleUpload} disabled={isUploading || uploadFiles.length === 0}>
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              上传 {uploadFiles.length > 0 ? `(${uploadFiles.length}个)` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 修改分类对话框 */}
      <Dialog open={!!editingFile} onOpenChange={(open) => !open && setEditingFile(null)}>
        <DialogContent className={DIALOG_FORM}>
          <DialogHeader>
            <DialogTitle>修改文献分类</DialogTitle>
            <DialogDescription>
              变更分类将移动物理文件，这会影响索引中的元数据。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>当前文献</Label>
              <div className="text-sm font-medium p-2 bg-muted rounded-md truncate">
                {editingFile?.name}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-category">目标分类</Label>
              <Select value={newCategoryName === "new_cat" ? "new_cat" : newCategoryName} onValueChange={(v) => {
                if (v === "new_cat") { setNewCategoryName("new_cat"); setNewCategoryInput(""); }
                else setNewCategoryName(v || "");
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="选择新分类" />
                </SelectTrigger>
                <SelectContent>
                  {categories.filter(c => c !== "全部").map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                  <SelectItem value="new_cat">+ 新增分类</SelectItem>
                </SelectContent>
              </Select>
              {newCategoryName === "new_cat" && (
                <Input
                  placeholder="输入新分类名称"
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                />
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-doc-type">文档类型</Label>
              <Select value={editDocumentType} onValueChange={(v) => v && setEditDocumentType(v)}>
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
            <Button variant="outline" onClick={() => setEditingFile(null)}>取消</Button>
            <Button onClick={handleUpdateCategory} disabled={isUpdatingCategory}>
              {isUpdatingCategory ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              确认变更
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 片段预览弹窗 — 语义搜索点击后展示相关文献片段 */}
      <Dialog open={!!snippetFile} onOpenChange={(open) => { if (!open) setSnippetFile(null); }}>
        <DialogContent className={DIALOG_FULL}>
          <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
            <DialogTitle className="text-lg truncate pr-8">{snippetFile?.name}</DialogTitle>
            <DialogDescription className="flex items-center gap-3">
              <Badge variant="outline" className="text-xs">{snippetFile?.category}</Badge>
              <span className="text-xs text-muted-foreground">{snippetFile?.chunkCount} 个匹配片段</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {snippetFile?._snippets?.map((snippet, i) => (
              <div key={i} className="p-5 rounded-xl bg-muted/30 border border-border/40 hover:border-primary/20 transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="secondary" className="text-xs h-6 px-2.5">匹配片段 {i + 1}</Badge>
                </div>
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-foreground/85">{snippet}</p>
              </div>
            ))}
            {(!snippetFile?._snippets || snippetFile._snippets.length === 0) && (
              <p className="text-base text-muted-foreground text-center py-16">暂无可预览的片段</p>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t px-6 py-4 gap-3">
            <Button variant="outline" onClick={() => setSnippetFile(null)}>关闭</Button>
            <Button
              onClick={() => {
                if (snippetFile) {
                  router.push(`/reader?file=${encodeURIComponent(snippetFile.name)}`);
                }
              }}
            >
              <ExternalLink className="mr-2 h-4 w-4" /> 在阅读器中打开完整文献
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <KnowledgeMetadataDialog
        file={metadataFile}
        open={isMetadataOpen}
        onOpenChange={(open) => {
          setIsMetadataOpen(open);
          if (!open) setMetadataFile(null);
        }}
        onSaved={fetchFiles}
      />

      <KnowledgeParseWarningDialog
        file={parseWarningFile}
        open={isParseWarningOpen}
        onOpenChange={(open) => {
          setIsParseWarningOpen(open);
          if (!open) setParseWarningFile(null);
        }}
        onForceReparse={(fileName) => handleSingleReindex(fileName, { files: [fileName], forceStage1: true })}
      />
    </>
  );
}
