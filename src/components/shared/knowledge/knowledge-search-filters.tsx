"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, FileText, Database, CheckSquare, Square } from "lucide-react";
import type { UseKnowledgeListReturn } from "@/hooks/use-knowledge-list";

interface KnowledgeSearchFiltersProps {
  kb: Pick<
    UseKnowledgeListReturn,
    | "searchQuery"
    | "setSearchQuery"
    | "searchType"
    | "setSearchType"
    | "totalFiles"
    | "categories"
    | "selectedCategory"
    | "setSelectedCategory"
    | "selectedFiles"
    | "files"
    | "selectAllPages"
    | "toggleSelectAll"
    | "selectAllAcrossPages"
    | "totalPages"
  >;
}

export function KnowledgeSearchFilters({ kb }: KnowledgeSearchFiltersProps) {
  return (
    <>
      <div className="flex flex-col md:flex-row gap-4 items-end md:items-center">
        <div className="relative flex-1 w-full flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={kb.searchType === "semantic" ? "搜索文献内容（语义检索）..." : "搜索文件名或分类..."}
              className="pl-9"
              value={kb.searchQuery}
              onChange={(e) => kb.setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            variant={kb.searchType === "semantic" ? "default" : "outline"}
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => kb.setSearchType(kb.searchType === "semantic" ? "name" : "semantic")}
            title={kb.searchType === "semantic" ? "切换到文件名搜索" : "切换到内容语义搜索"}
          >
            <FileText className="h-3.5 w-3.5" />
            {kb.searchType === "semantic" ? "语义" : "文件名"}
          </Button>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
          <Database className="h-4 w-4" />
          共 {kb.totalFiles} 篇文献
        </div>
      </div>

      <div className="w-full">
        <div className="flex items-center justify-between mb-4 overflow-x-auto gap-4">
          <Tabs value={kb.selectedCategory} onValueChange={kb.setSelectedCategory} className="bg-muted/50 rounded-lg p-1">
            <TabsList className="bg-transparent">
              {kb.categories.map((cat) => (
                <TabsTrigger key={cat} value={cat} className="px-4">
                  {cat}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2 shrink-0">
            {kb.selectAllPages ? (
              <Button variant="ghost" size="sm" className="text-xs h-8 gap-2" onClick={kb.toggleSelectAll}>
                <CheckSquare className="h-3.5 w-3.5" /> 取消全选（{kb.totalFiles} 篇）
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" className="text-xs h-8 gap-2" onClick={kb.toggleSelectAll}>
                  {kb.selectedFiles.length === kb.files.length && kb.files.length > 0 ? (
                    <>
                      <CheckSquare className="h-3.5 w-3.5" /> 取消全选
                    </>
                  ) : (
                    <>
                      <Square className="h-3.5 w-3.5" /> 全选本页
                    </>
                  )}
                </Button>
                {kb.totalPages > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-8 gap-1 text-muted-foreground"
                    onClick={kb.selectAllAcrossPages}
                  >
                    <Square className="h-3 w-3" /> 全选所有 {kb.totalFiles} 篇
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
