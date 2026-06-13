"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreVertical,
  Edit3,
  Trash2,
  Tag,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import { KnowledgeIndexActions } from "@/components/shared/knowledge/knowledge-index-actions";
import type { KnowledgeFile } from "@/services/knowledge";
import type { ReindexRequest } from "@/contracts/reindex";

interface KnowledgeFileRowActionsProps {
  file: KnowledgeFile;
  isIndexing: boolean;
  onReindex: (fileName: string, options: ReindexRequest) => void;
  onEditMetadata: (file: KnowledgeFile) => void;
  onEditCategory: (file: KnowledgeFile) => void;
  onDelete: (file: KnowledgeFile) => void;
  onShowParseWarning: (file: KnowledgeFile) => void;
}

export function KnowledgeFileRowActions({
  file,
  isIndexing,
  onReindex,
  onEditMetadata,
  onEditCategory,
  onDelete,
  onShowParseWarning,
}: KnowledgeFileRowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEditMetadata(file)}>
          <Edit3 className="mr-2 h-4 w-4" /> 编辑书目信息
        </DropdownMenuItem>
        <KnowledgeIndexActions
          file={file}
          disabled={isIndexing}
          onReindex={onReindex}
          onShowParseWarning={onShowParseWarning}
        />
        <DropdownMenuItem onClick={() => onEditCategory(file)}>
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
          onClick={() => onDelete(file)}
        >
          <Trash2 className="mr-2 h-4 w-4" /> 删除文献
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
