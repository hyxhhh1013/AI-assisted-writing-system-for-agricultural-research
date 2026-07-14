"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/error-utils";
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
import { createLogger } from "@/lib/logger";

const log = createLogger("knowledge-list");
import {
  applyReindexEvent,
  INITIAL_REINDEX_PROGRESS,
  type ReindexProgressState,
  type ReindexRequest,
} from "@/contracts/reindex";
import {
  filterKnowledgeFiles,
  hasActiveKnowledgeListFilters,
  type KnowledgeDoiFilter,
  type KnowledgeIndexStatusFilter,
  type KnowledgeListFilters,
} from "@/contracts/knowledge";

const PAGE_SIZE = 10;
/** 书目筛选需客户端过滤时一次拉取上限（过大时会明显变慢） */
const FILTER_FETCH_CAP = 500;

export function useKnowledgeList() {
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [categories, setCategories] = useState<string[]>(["全部"]);
  const [isLoading, setIsLoading] = useState(true);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState<ReindexProgressState>(INITIAL_REINDEX_PROGRESS);
  const reindexAbortRef = useRef<AbortController | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [searchType, setSearchType] = useState<"name" | "semantic">("name");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalFiles, setTotalFiles] = useState(0);
  const [journalFilter, setJournalFilter] = useState("");
  const [indexStatusFilter, setIndexStatusFilter] = useState<KnowledgeIndexStatusFilter>("all");
  const [doiFilter, setDoiFilter] = useState<KnowledgeDoiFilter>("all");
  const [bibFiltersOpen, setBibFiltersOpen] = useState(false);
  const [allFilesForFilter, setAllFilesForFilter] = useState<KnowledgeFile[]>([]);

  const [selectedFiles, setSelectedFiles] = useState<KnowledgeFile[]>([]);
  const [selectAllPages, setSelectAllPages] = useState(false);
  const [isBatchMoveOpen, setIsBatchMoveOpen] = useState(false);
  const [batchCategoryName, setBatchCategoryName] = useState("");
  const [batchNewInput, setBatchNewInput] = useState("");
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadCategory, setUploadCategory] = useState("未分类");
  const [uploadDocumentType, setUploadDocumentType] = useState("paper");
  const [uploadNewInput, setUploadNewInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const [editingFile, setEditingFile] = useState<KnowledgeFile | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [editDocumentType, setEditDocumentType] = useState("paper");
  const [isUpdatingCategory, setIsUpdatingCategory] = useState(false);

  const [snippetFile, setSnippetFile] = useState<KnowledgeFile | null>(null);
  const [metadataFile, setMetadataFile] = useState<KnowledgeFile | null>(null);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const [parseWarningFile, setParseWarningFile] = useState<KnowledgeFile | null>(null);
  const [isParseWarningOpen, setIsParseWarningOpen] = useState(false);

  const listFilters: KnowledgeListFilters = {
    journalContains: journalFilter,
    indexStatus: indexStatusFilter,
    doi: doiFilter,
  };
  const bibFiltersActive =
    bibFiltersOpen && hasActiveKnowledgeListFilters(listFilters);

  const toggleBibFilters = useCallback(() => {
    setBibFiltersOpen((open) => {
      if (open) {
        setJournalFilter("");
        setIndexStatusFilter("all");
        setDoiFilter("all");
      }
      return !open;
    });
  }, []);

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      if (bibFiltersActive && searchType === "name") {
        const data = await searchKnowledge({
          q: searchQuery || undefined,
          category: selectedCategory !== "全部" ? selectedCategory : undefined,
          type: searchType,
          page: 1,
          pageSize: FILTER_FETCH_CAP,
        });
        const filtered = filterKnowledgeFiles(data.files ?? [], listFilters);
        const start = (currentPage - 1) * PAGE_SIZE;
        setAllFilesForFilter(filtered);
        setFiles(filtered.slice(start, start + PAGE_SIZE));
        setTotalFiles(filtered.length);
        if (data.categories) setCategories(data.categories);
      } else {
        setAllFilesForFilter([]);
        const data = await searchKnowledge({
          q: searchQuery || undefined,
          category: selectedCategory !== "全部" ? selectedCategory : undefined,
          type: searchType,
          page: currentPage,
          pageSize: PAGE_SIZE,
        });
        if (data.files) setFiles(data.files);
        if (data.total !== undefined) setTotalFiles(data.total);
        if (data.categories) setCategories(data.categories);
      }
      setSelectedFiles([]);
      setSelectAllPages(false);
    } catch (e) {
      const message = e instanceof Error ? getErrorMessage(e) : "获取文献列表失败";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [
    searchQuery,
    selectedCategory,
    currentPage,
    searchType,
    bibFiltersActive,
    journalFilter,
    indexStatusFilter,
    doiFilter,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchFiles();
    }, 500);
    return () => clearTimeout(timer);
  }, [fetchFiles]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, searchType, journalFilter, indexStatusFilter, doiFilter]);

  const runReindex = useCallback(
    async (options?: ReindexKnowledgeOptions, startMessage?: string) => {
      if (isIndexing) return;

      reindexAbortRef.current?.abort();
      const controller = new AbortController();
      reindexAbortRef.current = controller;

      setIsIndexing(true);
      setIndexProgress(INITIAL_REINDEX_PROGRESS);
      toast.info(startMessage || "正在重新扫描并索引文献…");

      try {
        await reindexKnowledgeStream(
          (event) => {
            setIndexProgress((prev) => applyReindexEvent(prev, event));
          },
          controller.signal,
          options,
        );
        toast.success("本地知识库索引已更新！");
        void fetchFiles();
      } catch (error: unknown) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          // 用户手动取消，不显示错误
        } else {
          const msg = error instanceof Error ? getErrorMessage(error) : "操作失败";
          // 网络错误通常已经重试过了，这里显示最终失败信息
          if (msg.includes("索引流意外结束") || msg.includes("重试")) {
            toast.warning("索引连接中断，但后台仍继续处理中。刷新页面可查看最新进度。");
          } else {
            toast.error(msg);
          }
        }
      } finally {
        setIsIndexing(false);
        reindexAbortRef.current = null;
      }
    },
    [isIndexing, fetchFiles],
  );

  const handleReindex = useCallback(() => {
    void runReindex();
  }, [runReindex]);

  const handleSingleReindex = useCallback(
    (fileName: string, options: ReindexRequest) => {
      const label = options.forceStage1
        ? "强制重解析"
        : options.forceStage3
          ? "强制重嵌向量"
          : "重新索引";
      void runReindex({ ...options, files: [fileName] }, `正在${label}：${fileName}`);
    },
    [runReindex],
  );

  const handleCancelReindex = useCallback(() => {
    reindexAbortRef.current?.abort();
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedFiles.length === files.length || selectAllPages) {
      setSelectedFiles([]);
      setSelectAllPages(false);
    } else {
      setSelectedFiles([...files]);
    }
  }, [selectedFiles.length, files, selectAllPages]);

  const selectAllAcrossPages = useCallback(async () => {
    try {
      if (bibFiltersActive && allFilesForFilter.length > 0) {
        setSelectedFiles([...allFilesForFilter]);
        setSelectAllPages(true);
        return;
      }
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
  }, [
    searchQuery,
    selectedCategory,
    searchType,
    totalFiles,
    bibFiltersActive,
    allFilesForFilter,
  ]);

  const toggleSelectFile = useCallback((file: KnowledgeFile) => {
    setSelectedFiles((prev) =>
      prev.find((f) => f.name === file.name) ? prev.filter((f) => f.name !== file.name) : [...prev, file],
    );
    setSelectAllPages(false);
  }, []);

  const handleBatchMove = useCallback(async () => {
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
      void fetchFiles();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? getErrorMessage(error) : "操作失败");
    } finally {
      setIsBatchProcessing(false);
    }
  }, [batchCategoryName, batchNewInput, selectedFiles, fetchFiles]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedFiles.length} 个文件吗？此操作不可撤销。`)) return;
    setIsBatchProcessing(true);
    try {
      const message = await batchDeleteKnowledgeFiles(
        selectedFiles.map((f) => ({ name: f.name, category: f.category })),
      );
      toast.success(message);
      void fetchFiles();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? getErrorMessage(error) : "操作失败");
    } finally {
      setIsBatchProcessing(false);
    }
  }, [selectedFiles, fetchFiles]);

  const handleDeleteFile = useCallback(
    async (file: KnowledgeFile) => {
      if (!confirm(`确定要删除文件 "${file.name}" 吗？`)) return;
      try {
        await deleteKnowledgeFile(file.name, file.category);
        toast.success("文件已删除");
        void fetchFiles();
      } catch (error: unknown) {
        toast.error(error instanceof Error ? getErrorMessage(error) : "操作失败");
      }
    },
    [fetchFiles],
  );

  const handleUpload = useCallback(async () => {
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
        log.fail("knowledge upload failed", e, { fileName: file.name });
      }
    }
    toast.success(`上传完成：${successCount}/${uploadFiles.length} 个文件`);
    setIsUploadOpen(false);
    setUploadFiles([]);
    void fetchFiles();
    setIsUploading(false);
  }, [uploadFiles, uploadCategory, uploadNewInput, uploadDocumentType, fetchFiles]);

  const handleUpdateCategory = useCallback(async () => {
    const catName = newCategoryName === "new_cat" ? newCategoryInput : newCategoryName;
    if (!editingFile || !catName) return;
    setIsUpdatingCategory(true);
    try {
      await updateFileCategory(editingFile.name, editingFile.category, catName, editDocumentType);
      toast.success("分类更新成功！");
      setEditingFile(null);
      void fetchFiles();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? getErrorMessage(error) : "操作失败");
    } finally {
      setIsUpdatingCategory(false);
    }
  }, [editingFile, newCategoryName, newCategoryInput, editDocumentType, fetchFiles]);

  const openMetadataEditor = useCallback((file: KnowledgeFile) => {
    setMetadataFile(file);
    setIsMetadataOpen(true);
  }, []);

  const openEditCategory = useCallback((file: KnowledgeFile) => {
    setEditingFile(file);
    setNewCategoryName(file.category);
    setEditDocumentType(file.documentType === "journal" ? "paper" : file.documentType || "paper");
  }, []);

  const formatSize = useCallback((bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }, []);

  const totalPages = Math.ceil(totalFiles / PAGE_SIZE);
  const categoryOptions = categories.filter((c) => c !== "全部");

  return {
    files,
    categories,
    categoryOptions,
    isLoading,
    isIndexing,
    indexProgress,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    searchType,
    setSearchType,
    currentPage,
    setCurrentPage,
    pageSize: PAGE_SIZE,
    totalFiles,
    totalPages,
    selectedFiles,
    setSelectedFiles,
    selectAllPages,
    toggleSelectAll,
    selectAllAcrossPages,
    toggleSelectFile,
    isBatchMoveOpen,
    setIsBatchMoveOpen,
    batchCategoryName,
    setBatchCategoryName,
    batchNewInput,
    setBatchNewInput,
    isBatchProcessing,
    handleBatchMove,
    handleBatchDelete,
    isUploadOpen,
    setIsUploadOpen,
    uploadFiles,
    setUploadFiles,
    uploadCategory,
    setUploadCategory,
    uploadDocumentType,
    setUploadDocumentType,
    uploadNewInput,
    setUploadNewInput,
    isUploading,
    handleUpload,
    editingFile,
    setEditingFile,
    newCategoryName,
    setNewCategoryName,
    newCategoryInput,
    setNewCategoryInput,
    editDocumentType,
    setEditDocumentType,
    isUpdatingCategory,
    handleUpdateCategory,
    openEditCategory,
    snippetFile,
    setSnippetFile,
    metadataFile,
    setMetadataFile,
    isMetadataOpen,
    setIsMetadataOpen,
    parseWarningFile,
    setParseWarningFile,
    isParseWarningOpen,
    setIsParseWarningOpen,
    openMetadataEditor,
    fetchFiles,
    handleReindex,
    handleSingleReindex,
    handleCancelReindex,
    handleDeleteFile,
    formatSize,
    journalFilter,
    setJournalFilter,
    indexStatusFilter,
    setIndexStatusFilter,
    doiFilter,
    setDoiFilter,
    bibFiltersOpen,
    toggleBibFilters,
    bibFiltersActive,
  };
}

export type UseKnowledgeListReturn = ReturnType<typeof useKnowledgeList>;
