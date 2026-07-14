"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ExternalLink, Shield } from "lucide-react";

interface AdminRecordProjectLinksProps {
  projectId: string;
  qualityTab?: "review" | "check" | "history";
}

export function AdminRecordProjectLinks({ projectId, qualityTab }: AdminRecordProjectLinksProps) {
  const qualityHref = qualityTab
    ? `/plagiarism?id=${encodeURIComponent(projectId)}&tab=${qualityTab}`
    : `/plagiarism?id=${encodeURIComponent(projectId)}`;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#1a5632]/10">
      <Link href={`/workbench?id=${encodeURIComponent(projectId)}`} target="_blank">
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
          <ExternalLink className="h-3 w-3" />
          打开项目
        </Button>
      </Link>
      <Link href={qualityHref} target="_blank">
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
          <Shield className="h-3 w-3" />
          质量中心
        </Button>
      </Link>
    </div>
  );
}
