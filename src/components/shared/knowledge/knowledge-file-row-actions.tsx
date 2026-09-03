"use client";

import Link from "next/link";
import { toast } from "sonner";
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
import { canOpenKnowledgePdf } from "@/contracts/knowledge";
import { KnowledgeIndexActions } from "@/components/shared/knowledge/knowledge-index-actions";
import type { KnowledgeFile } from "@/services/knowledge";
import type { ReindexRequest } from "@/contracts/reindex";

interface KnowledgeFileRowActionsProps {
  file: KnowledgeFile;
  isIndexing: boolean;
  canDelete?: boolean;
  onReindex: (fileName: string, options: ReindexRequest) => void;
  onEditMetadata: (file: KnowledgeFile) => void;
  onEditCategory: (file: KnowledgeFile) => void;
  onDelete: (file: KnowledgeFile) => void;
  onShowParseWarning: (file: KnowledgeFile) => void;
}

export function KnowledgeFileRowActions({
  file,
  isIndexing,
  canDelete = false,
  onReindex,
  onEditMetadata,
  onEditCategory,
  onDelete,
  onShowParseWarning,
}: KnowledgeFileRowActionsProps) {
  const pdfReady = canOpenKnowledgePdf(file);

  const warnNoPdf = () => {
    toast.error(
      file.diskCategory
        ? `磁盘上未在「${file.category}」找到 PDF，文件可能在「${file.diskCategory}」。请修改分类或重新上传。`
        : "该条仅为书目占位，尚未上传 PDF。请先上传 PDF 或删除该条。",
    );
  };

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
        {pdfReady ? (
          <>
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
          </>
        ) : (
          <>
            <DropdownMenuItem onClick={warnNoPdf}>
              <BookOpen className="mr-2 h-4 w-4 opacity-50" /> AI 精读（需 PDF）
            </DropdownMenuItem>
            <DropdownMenuItem onClick={warnNoPdf}>
              <ExternalLink className="mr-2 h-4 w-4 opacity-50" /> 阅读文献（需 PDF）
            </DropdownMenuItem>
          </>
        )}
        {canDelete && (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDelete(file)}
          >
            <Trash2 className="mr-2 h-4 w-4" /> 删除文献
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
