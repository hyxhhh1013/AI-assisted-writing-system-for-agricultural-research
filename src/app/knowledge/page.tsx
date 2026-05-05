"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { 
  ArrowLeft, Loader2, RefreshCw, FileText, 
  CheckCircle2, AlertCircle, ExternalLink, 
  Search, Tag, Calendar, Database, Upload,
  MoreVertical, Edit3, Trash2, CheckSquare, Square,
  ChevronLeft, ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
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

interface KnowledgeFile {
  name: string;
  category: string;
  chunkCount: number;
  size: number;
  mtime: string;
}

export default function KnowledgePage() {
  const router = useRouter();
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [categories, setCategories] = useState<string[]>(["全部"]);
  const [isLoading, setIsLoading] = useState(true);
  const [isIndexing, setIsIndexing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("全部");
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalFiles, setTotalFiles] = useState(0);

  // 多选与批量操作状态
  const [selectedFiles, setSelectedFiles] = useState<KnowledgeFile[]>([]);
  const [isBatchMoveOpen, setIsBatchMoveOpen] = useState(false);
  const [batchCategoryName, setBatchCategoryName] = useState("");
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // 上传相关状态
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState("未分类");
  const [isUploading, setIsUploading] = useState(false);

  // 修改分类相关状态
  const [editingFile, setEditingFile] = useState<KnowledgeFile | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isUpdatingCategory, setIsUpdatingCategory] = useState(false);

  const fetchFiles = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== "全部") params.append("category", selectedCategory);
      if (searchQuery) params.append("q", searchQuery);
      params.append("page", currentPage.toString());
      params.append("pageSize", pageSize.toString());

      const res = await fetch(`/api/knowledge?${params.toString()}`);
      const data = await res.json();
      if (data.files) setFiles(data.files);
      if (data.total !== undefined) setTotalFiles(data.total);
      if (data.categories) setCategories(data.categories);
      setSelectedFiles([]); // 刷新列表后清空选择
    } catch (error) {
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
  }, [searchQuery, selectedCategory, currentPage]);

  // 当搜索或分类改变时，重置页码
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory]);

  const handleReindex = async () => {
    setIsIndexing(true);
    toast.info("正在重新扫描并索引文献，请稍候...");
    try {
      const res = await fetch("/api/knowledge?action=reindex", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success("本地知识库索引已更新！");
        fetchFiles();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsIndexing(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedFiles.length === files.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles([...files]);
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
    if (selectedFiles.length === 0 || !batchCategoryName) return;
    setIsBatchProcessing(true);

    try {
      const res = await fetch("/api/knowledge", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "batch_move",
          files: selectedFiles.map(f => ({ name: f.name, category: f.category })),
          newCategory: batchCategoryName,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(data.message);
        setIsBatchMoveOpen(false);
        fetchFiles();
      } else {
        const data = await res.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedFiles.length === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedFiles.length} 个文件吗？此操作不可撤销。`)) return;
    
    setIsBatchProcessing(true);
    try {
      const res = await fetch("/api/knowledge?batch=true", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: selectedFiles.map(f => ({ name: f.name, category: f.category }))
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(data.message);
        fetchFiles();
      } else {
        const data = await res.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleDeleteFile = async (file: KnowledgeFile) => {
    if (!confirm(`确定要删除文件 "${file.name}" 吗？`)) return;

    try {
      const res = await fetch(`/api/knowledge?name=${encodeURIComponent(file.name)}&category=${encodeURIComponent(file.category)}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("文件已删除");
        fetchFiles();
      } else {
        const data = await res.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("category", uploadCategory);

    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        body: formData,
      });
      
      if (res.ok) {
        toast.success("文件上传成功！请记得更新索引。");
        setIsUploadOpen(false);
        setUploadFile(null);
        fetchFiles();
      } else {
        const data = await res.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingFile || !newCategoryName) return;
    setIsUpdatingCategory(true);

    try {
      const res = await fetch("/api/knowledge", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingFile.name,
          oldCategory: editingFile.category,
          newCategory: newCategoryName,
        }),
      });

      if (res.ok) {
        toast.success("分类更新成功！");
        setEditingFile(null);
        fetchFiles();
      } else {
        const data = await res.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsUpdatingCategory(false);
    }
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
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <Button variant="ghost" className="mb-6" onClick={() => router.push("/")}>
        <ArrowLeft className="mr-2 h-4 w-4" /> 返回首页
      </Button>

      <div className="space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">知识库管理</h1>
            <p className="text-muted-foreground mt-1">
              集成检索与分类功能，支持高效管理海量实验室私有文献。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsUploadOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> 上传文献
            </Button>
            <Button onClick={handleReindex} disabled={isIndexing} className="shrink-0">
              {isIndexing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              重新构建索引
            </Button>
          </div>
        </header>

        {isIndexing && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">正在解析 PDF 并构建向量索引...</span>
                <span className="text-sm text-muted-foreground">处理中，请勿离开</span>
              </div>
              <Progress value={65} className="h-2" />
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
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索文件名、分类或内容关键字..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
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
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-xs h-8 gap-2"
                onClick={toggleSelectAll}
              >
                {selectedFiles.length === files.length && files.length > 0 ? (
                  <><CheckSquare className="h-3.5 w-3.5" /> 取消全选</>
                ) : (
                  <><Square className="h-3.5 w-3.5" /> 全选</>
                )}
              </Button>
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

                        <Link
                          href={`/reader?file=${encodeURIComponent(file.name)}`}
                          className="flex items-center flex-1 min-w-0 mr-4 cursor-pointer"
                        >
                          <div className="p-2 rounded bg-primary/10 mr-3 shrink-0">
                            <FileText className="h-5 w-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-medium truncate group-hover:text-primary transition-colors">
                              {file.name}
                            </h3>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span className="flex items-center">
                                <Tag className="mr-1 h-3 w-3" />
                                {file.category}
                              </span>
                              <span className="flex items-center">
                                <Database className="mr-1 h-3 w-3" />
                                {file.chunkCount} 知识片段
                              </span>
                              <span className="hidden md:flex items-center">
                                <Calendar className="mr-1 h-3 w-3" />
                                {new Date(file.mtime).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </Link>
                        
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
                              <DropdownMenuItem onClick={() => {
                                setEditingFile(file);
                                setNewCategoryName(file.category);
                              }}>
                                <Edit3 className="mr-2 h-4 w-4" /> 修改分类
                              </DropdownMenuItem>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量修改分类</DialogTitle>
            <DialogDescription>
              将选中的 {selectedFiles.length} 个文件移动到新分类。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="batch-category">目标分类</Label>
            <Select value={batchCategoryName} onValueChange={(v) => setBatchCategoryName(v || "")}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="选择目标分类" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
                <SelectItem value="batch_new">+ 新增分类</SelectItem>
              </SelectContent>
            </Select>
            {batchCategoryName === "batch_new" && (
              <Input 
                className="mt-2"
                placeholder="输入新分类名称" 
                onChange={(e) => setBatchCategoryName(e.target.value)}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>上传新文献</DialogTitle>
            <DialogDescription>
              选择 PDF 文件并指定分类。上传后请手动触发索引重建以供 AI 检索。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="file">PDF 文件</Label>
              <Input 
                id="file" 
                type="file" 
                accept=".pdf" 
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category">所属分类</Label>
              <div className="flex gap-2">
                <Select value={uploadCategory} onValueChange={(v) => setUploadCategory(v || "")}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="选择分类" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                    <SelectItem value="new">+ 新增分类</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {uploadCategory === "new" && (
                <Input 
                  placeholder="输入新分类名称" 
                  onChange={(e) => setUploadCategory(e.target.value)}
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadOpen(false)}>取消</Button>
            <Button onClick={handleUpload} disabled={isUploading || !uploadFile}>
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              开始上传
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 修改分类对话框 */}
      <Dialog open={!!editingFile} onOpenChange={(open) => !open && setEditingFile(null)}>
        <DialogContent>
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
              <Select value={newCategoryName} onValueChange={(v) => setNewCategoryName(v || "")}>
                <SelectTrigger>
                  <SelectValue placeholder="选择新分类" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                  <SelectItem value="new_cat">+ 新增分类</SelectItem>
                </SelectContent>
              </Select>
              {newCategoryName === "new_cat" && (
                <Input 
                  placeholder="输入新分类名称" 
                  onChange={(e) => setNewCategoryName(e.target.value)}
                />
              )}
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
    </div>
  );
}
