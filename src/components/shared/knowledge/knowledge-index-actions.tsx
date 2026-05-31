"use client";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AlertTriangle, FileSearch, RefreshCw } from "lucide-react";
import type { KnowledgeFileRecord } from "@/contracts/knowledge";
import type { ReindexRequest } from "@/contracts/reindex";

export interface KnowledgeIndexActionsProps {
  file: KnowledgeFileRecord;
  disabled?: boolean;
  onReindex: (fileName: string, options: ReindexRequest) => void;
  onShowParseWarning: (file: KnowledgeFileRecord) => void;
}

export function KnowledgeIndexActions({
  file,
  disabled,
  onReindex,
  onShowParseWarning,
}: KnowledgeIndexActionsProps) {
  const hasParseWarning = file.parseWarning === "no_text" || file.parseWarning === "low_text";

  return (
    <>
      <DropdownMenuItem
        disabled={disabled}
        onClick={() => onReindex(file.name, { files: [file.name], forceStage1: true })}
      >
        <FileSearch className="mr-2 h-4 w-4" />
        强制重解析
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={disabled}
        onClick={() => onReindex(file.name, { files: [file.name], forceStage3: true })}
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        强制重嵌向量
      </DropdownMenuItem>
      {hasParseWarning && (
        <DropdownMenuItem onClick={() => onShowParseWarning(file)}>
          <AlertTriangle className="mr-2 h-4 w-4" />
          查看解析说明
        </DropdownMenuItem>
      )}
    </>
  );
}
