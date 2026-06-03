"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, CheckCircle2, ExternalLink, Search, Library } from "lucide-react";
import { toast } from "sonner";
import { TabPanelShell } from "@/components/shared/tab-panel-shell";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listKnowledgeFiles } from "@/services/knowledge";
import Link from "next/link";

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
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    listKnowledgeFiles()
      .then((data) => { if (data.files) setFiles(data.files); })
      .catch(() => toast.error("获取文献列表失败"))
      .finally(() => setIsLoading(false));
  }, []);

  const filteredFiles = files.filter(f =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <TabPanelShell
      title="文献库"
      icon={FileText}
      actions={
        <Link href="/knowledge">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="打开知识库管理">
            <Library className="h-3.5 w-3.5" />
          </Button>
        </Link>
      }
      tools={
        <div className="flex items-center gap-2 w-full">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索文献或分类..."
              className="pl-8 h-7 text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Link href="/knowledge" className="text-[10px] text-[#1a5632] hover:underline whitespace-nowrap shrink-0">
            管理
          </Link>
        </div>
      }
    >
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
          <div className="text-center py-8 text-muted-foreground text-xs space-y-2">
            <p className="italic">未发现匹配文献</p>
            <Link href="/knowledge" className="text-[#1a5632] hover:underline text-[10px]">
              前往知识库上传文献
            </Link>
          </div>
        )}
      </ScrollArea>
    </TabPanelShell>
  );
}
