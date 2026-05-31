"use client";

import { Badge } from "@/components/ui/badge";
import {
  getKnowledgeIndexStatus,
  type KnowledgeFileRecord,
} from "@/contracts/knowledge";

const STATUS_VARIANT: Record<
  ReturnType<typeof getKnowledgeIndexStatus>["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  ready: "default",
  partial: "secondary",
  unindexed: "outline",
};

interface KnowledgeIndexBadgeProps {
  file: Pick<KnowledgeFileRecord, "chunkCount" | "bib" | "bibEdited" | "documentType" | "parseWarning">;
}

export function KnowledgeIndexBadge({ file }: KnowledgeIndexBadgeProps) {
  const info = getKnowledgeIndexStatus(file);

  return (
    <Badge
      variant={STATUS_VARIANT[info.status]}
      className="text-xs py-0 px-1.5 shrink-0"
      title={info.missingFields.length > 0 ? `缺少：${info.missingFields.join("、")}` : undefined}
    >
      {info.label}
    </Badge>
  );
}
