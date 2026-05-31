"use client";

import {
  getGbTagLabel,
  getKnowledgeAuthorLine,
  getKnowledgeDisplayTitle,
  getKnowledgeSubtitleLine,
  type KnowledgeFileRecord,
} from "@/contracts/knowledge";
import { Badge } from "@/components/ui/badge";

interface KnowledgeBibSummaryProps {
  file: KnowledgeFileRecord;
}

export function KnowledgeBibSummary({ file }: KnowledgeBibSummaryProps) {
  const title = getKnowledgeDisplayTitle(file);
  const author = getKnowledgeAuthorLine(file);
  const subtitle = getKnowledgeSubtitleLine(file);
  const gbLabel = getGbTagLabel(file.gbTag);
  const showFilename = title !== file.name.replace(/\.pdf$/i, "");

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 min-w-0">
        <h3 className="font-medium truncate group-hover:text-primary transition-colors">
          {title}
        </h3>
        {file.bibEdited && (
          <Badge variant="outline" className="text-[10px] py-0 px-1 shrink-0 border-amber-400 text-amber-700">
            已校正
          </Badge>
        )}
      </div>
      {showFilename && (
        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{file.name}</p>
      )}
      {(author || subtitle || gbLabel) && (
        <p className="text-xs text-muted-foreground truncate mt-1">
          {[author, subtitle, gbLabel].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}
