"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw, Database, Upload, Globe, BookOpen } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { siteTheme } from "@/lib/site-theme";
import { useKnowledgeList } from "@/hooks/use-knowledge-list";
import { KnowledgeReindexProgress } from "@/components/shared/knowledge/knowledge-reindex-progress";
import { KnowledgeBatchToolbar } from "@/components/shared/knowledge/knowledge-batch-toolbar";
import { KnowledgeSearchFilters } from "@/components/shared/knowledge/knowledge-search-filters";
import { KnowledgeBibFilters } from "@/components/shared/knowledge/knowledge-bib-filters";
import { KnowledgeFileTable } from "@/components/shared/knowledge/knowledge-file-table";
import { KnowledgePageDialogs } from "@/components/shared/knowledge/knowledge-page-dialogs";
import { KnowledgeExternalSearch } from "@/components/shared/knowledge/knowledge-external-search";
import { KnowledgeBibliographyImportDialog } from "@/components/shared/knowledge/knowledge-bibliography-import-dialog";

export default function KnowledgePageClient() {
  const router = useRouter();
  const kb = useKnowledgeList();
  const [mainTab, setMainTab] = useState<"local" | "external">("local");
  const [isBibImportOpen, setIsBibImportOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="知识库管理"
        subtitle="集成检索与分类功能，支持高效管理海量实验室私有文献"
        icon={Database}
        actions={
          mainTab === "local" ? (
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" className="border-[#1a5632]/20" onClick={() => setIsBibImportOpen(true)}>
                <BookOpen className="mr-2 h-4 w-4" /> 导入书目
              </Button>
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
          ) : null
        }
      />

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "local" | "external")} className="space-y-6">
        <TabsList>
          <TabsTrigger value="local" className="gap-2">
            <Database className="h-4 w-4" />
            本地库
          </TabsTrigger>
          <TabsTrigger value="external" className="gap-2">
            <Globe className="h-4 w-4" />
            外部检索
          </TabsTrigger>
        </TabsList>

        <TabsContent value="local" className="space-y-6 mt-0">
          <KnowledgeReindexProgress
            isIndexing={kb.isIndexing}
            indexProgress={kb.indexProgress}
            onCancel={kb.handleCancelReindex}
          />
          <KnowledgeBatchToolbar {...kb} />
          <KnowledgeSearchFilters kb={kb} />
          <KnowledgeBibFilters kb={kb} />
          <KnowledgeFileTable router={router} kb={kb} />
        </TabsContent>

        <TabsContent value="external" className="mt-0">
          <KnowledgeExternalSearch />
        </TabsContent>
      </Tabs>

      <KnowledgePageDialogs router={router} kb={kb} />
      <KnowledgeBibliographyImportDialog
        open={isBibImportOpen}
        onOpenChange={setIsBibImportOpen}
        categories={kb.categories}
        onImported={() => void kb.fetchFiles()}
      />
    </>
  );
}
