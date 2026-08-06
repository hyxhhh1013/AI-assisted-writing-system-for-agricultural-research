"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, BookMarked } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatFilenames } from "@/services/references";
import { patchReferences } from "@/services/project";
import { listKnowledgeFiles } from "@/services/knowledge";

interface KnowledgeReferencePickerProps {
  projectId: string;
  onImported?: () => void;
}

interface KnowledgeFile {
  name: string;
  category: string;
}

function quickCleanFilename(raw: string): string {
  return raw
    .replace(/\.pdf$/i, "")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 从知识库 PDF 文件名生成引文并加入项目参考文献 */
export function KnowledgeReferencePicker({
  projectId,
  onImported,
}: KnowledgeReferencePickerProps) {
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState<string | null>(null);

  useEffect(() => {
    listKnowledgeFiles()
      .then((data) => {
        if (data.files) {
          setFiles(
            data.files.map((f) => ({ name: f.name, category: f.category })),
          );
        }
      })
      .catch(() => toast.error("获取知识库文献失败"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = files.filter(
    (f) =>
      f.name.toLowerCase().includes(query.toLowerCase()) ||
      f.category.toLowerCase().includes(query.toLowerCase()),
  );

  const handleImport = useCallback(
    async (fileName: string) => {
      setImporting(fileName);
      try {
        const formatted = await formatFilenames([fileName]);
        const citation = formatted[fileName]?.trim() || quickCleanFilename(fileName);
        await patchReferences(projectId, [{ op: "create", content: citation }]);
        toast.success("已加入参考文献");
        onImported?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "导入失败");
      } finally {
        setImporting(null);
      }
    },
    [projectId, onImported],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        placeholder="筛选 PDF 文件名或分类…"
        className="h-8 text-xs"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">
          知识库暂无 PDF，请先在「知识库」页上传。
        </p>
      ) : (
        <ScrollArea className="max-h-[min(420px,50vh)]">
          <div className="space-y-1 pr-2">
            {filtered.map((file) => (
              <div
                key={file.name}
                className="flex items-start gap-2 rounded-md border bg-card p-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium leading-snug truncate">{file.name}</p>
                  <p className="text-[9px] text-muted-foreground">{file.category}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] shrink-0"
                  disabled={importing === file.name}
                  onClick={() => void handleImport(file.name)}
                >
                  {importing === file.name ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <BookMarked className="h-3 w-3 mr-1" />
                      加入
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
