"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BookMarked, Globe, Library } from "lucide-react";
import { KnowledgeExternalSearch } from "@/components/shared/knowledge/knowledge-external-search";
import { KnowledgeReferencePicker } from "@/components/shared/project/knowledge-reference-picker";

type ImportView = "external" | "knowledge";

interface ProjectReferenceImportPanelProps {
  projectId: string;
  onImported?: () => void;
  className?: string;
}

/** 工作台文献库：与知识库页相同的外部检索 + 知识库条目导入 */
export function ProjectReferenceImportPanel({
  projectId,
  onImported,
  className,
}: ProjectReferenceImportPanelProps) {
  const [view, setView] = useState<ImportView>("external");

  const handleImported = useCallback(() => {
    onImported?.();
  }, [onImported]);

  return (
    <div className={cn("flex flex-col h-full min-h-0 gap-3", className)}>
      <p className="text-[10px] text-[#6b7c72] leading-relaxed shrink-0">
        检索 OpenAlex / PubMed 等外部库，或从本地知识库 PDF 生成 GB/T 引文并加入<strong>当前项目</strong>参考文献（与写作扩写使用的列表一致）。
      </p>

      <div className="flex gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setView("external")}
          className={cn(
            "flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium",
            view === "external"
              ? "bg-[#1a5632] text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          <Globe className="h-3 w-3" />
          外部检索
        </button>
        <button
          type="button"
          onClick={() => setView("knowledge")}
          className={cn(
            "flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium",
            view === "knowledge"
              ? "bg-[#1a5632] text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          <Library className="h-3 w-3" />
          知识库 PDF
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
        {view === "external" ? (
          <KnowledgeExternalSearch
            fixedProjectId={projectId}
            compact
            onReferenceImported={handleImported}
          />
        ) : (
          <KnowledgeReferencePicker projectId={projectId} onImported={handleImported} />
        )}
      </div>

      <div className="shrink-0 rounded-md border border-dashed border-[#1a5632]/20 bg-[#1a5632]/5 px-2 py-1.5 flex items-start gap-2">
        <BookMarked className="h-3.5 w-3.5 text-[#1a5632] mt-0.5 shrink-0" />
        <p className="text-[10px] text-[#3d4f45] leading-snug">
          导入后可在「章节结构」侧栏查看参考文献列表；扩写时新文献会自动进入 RAG 检索范围。
        </p>
      </div>
    </div>
  );
}
