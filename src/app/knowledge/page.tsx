"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Database, Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { siteTheme } from "@/lib/site-theme";
import { useKnowledgeList } from "@/hooks/use-knowledge-list";
import { KnowledgeReindexProgress } from "@/components/shared/knowledge/knowledge-reindex-progress";
import { KnowledgeBatchToolbar } from "@/components/shared/knowledge/knowledge-batch-toolbar";
import { KnowledgeSearchFilters } from "@/components/shared/knowledge/knowledge-search-filters";
import { KnowledgeBibFilters } from "@/components/shared/knowledge/knowledge-bib-filters";
import { KnowledgeFileTable } from "@/components/shared/knowledge/knowledge-file-table";
import { KnowledgePageDialogs } from "@/components/shared/knowledge/knowledge-page-dialogs";

export default function KnowledgePage() {
  const router = useRouter();
  const kb = useKnowledgeList();

  return (
    <>
      <PageHeader
        title="知识库管理"
        subtitle="集成检索与分类功能，支持高效管理海量实验室私有文献"
        icon={Database}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="border-[#1a5632]/20" onClick={() => kb.setIsUploadOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> 上传文献
            </Button>
            <Button onClick={kb.handleReindex} disabled={kb.isIndexing} className={`shrink-0 ${siteTheme.btnPrimary}`}>
              {kb.isIndexing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              重新构建索引
            </Button>
          </div>
        }
      />

      <div className="space-y-6">
        <KnowledgeReindexProgress
          isIndexing={kb.isIndexing}
          indexProgress={kb.indexProgress}
          onCancel={kb.handleCancelReindex}
        />
        <KnowledgeBatchToolbar {...kb} />
        <KnowledgeSearchFilters kb={kb} />
        <KnowledgeBibFilters kb={kb} />
        <KnowledgeFileTable router={router} kb={kb} />
      </div>

      <KnowledgePageDialogs router={router} kb={kb} />
    </>
  );
}
