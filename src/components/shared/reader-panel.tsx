"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Loader2, RefreshCw, FileText, CheckCircle2, ExternalLink, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ReaderPanelProps {
  onOpenFile: (fileName: string) => void;
}

interface KnowledgeFile {
  name: string;
  category: string;
  chunkCount: number;
}

export function ReaderPanel({ onOpenFile }: ReaderPanelProps) {
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isIndexing, setIsIndexing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchFiles = async () => {
    try {
      const res = await fetch("/api/knowledge");
      const data = await res.json();
      if (data.files) setFiles(data.files);
    } catch (error) {
      toast.error("获取文献列表失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleReindex = async () => {
    setIsIndexing(true);
    toast.info("正在重新扫描并索引文献...");
    try {
      const res = await fetch("/api/knowledge?action=reindex", { method: "POST" });
      if (res.ok) {
        toast.success("知识库已更新");
        fetchFiles();
      }
    } catch (error) {
      toast.error("更新失败");
    } finally {
      setIsIndexing(false);
    }
  };

  const filteredFiles = files.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" /> 文献库
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleReindex} disabled={isIndexing}>
          <RefreshCw className={`h-3.5 w-3.5 ${isIndexing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="搜索文献或分类..."
          className="pl-8 h-8 text-xs"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <ScrollArea className="flex-1 -mx-1 px-1">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/30" />
          </div>
        ) : filteredFiles.length > 0 ? (
          <div className="space-y-1">
            {filteredFiles.map((file) => (
              <button
                key={file.name}
                onClick={() => onOpenFile(file.name)}
                className="w-full text-left p-2 rounded-md border bg-card hover:bg-muted/50 transition-colors group flex items-start gap-2"
              >
                <CheckCircle2 className="h-3 w-3 mt-0.5 text-green-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-medium leading-tight break-all block truncate">{file.name}</span>
                  <span className="text-[9px] text-muted-foreground block mt-0.5">{file.category}</span>
                </div>
                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-xs italic">
            未发现匹配文献
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
