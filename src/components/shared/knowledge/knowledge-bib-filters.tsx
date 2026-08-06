"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, Filter } from "lucide-react";
import type { UseKnowledgeListReturn } from "@/hooks/use-knowledge-list";

interface KnowledgeBibFiltersProps {
  kb: Pick<
    UseKnowledgeListReturn,
    | "journalFilter"
    | "setJournalFilter"
    | "indexStatusFilter"
    | "setIndexStatusFilter"
    | "doiFilter"
    | "setDoiFilter"
    | "bibFiltersOpen"
    | "toggleBibFilters"
    | "bibFiltersActive"
    | "searchType"
  >;
}

export function KnowledgeBibFilters({ kb }: KnowledgeBibFiltersProps) {
  if (kb.searchType === "semantic") {
    return (
      <p className="text-xs text-muted-foreground">
        语义检索模式下书目筛选不可用，请切换为「文件名」搜索后使用。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-2 border-dashed"
        onClick={kb.toggleBibFilters}
      >
        <Filter className="h-3.5 w-3.5" />
        {kb.bibFiltersOpen ? "收起书目筛选" : "展开书目筛选"}
        {kb.bibFiltersActive && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">筛选中</span>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 opacity-60 transition-transform ${kb.bibFiltersOpen ? "rotate-180" : ""}`}
        />
      </Button>

      {kb.bibFiltersOpen ? (
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center p-3 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
            <Filter className="h-4 w-4" />
            书目筛选
            <span className="text-[10px] text-muted-foreground/80">（会拉取更多记录，大数据库较慢）</span>
          </div>
          <Input
            placeholder="期刊名包含…"
            className="h-8 text-sm max-w-xs"
            value={kb.journalFilter}
            onChange={(e) => kb.setJournalFilter(e.target.value)}
          />
          <Select
            value={kb.indexStatusFilter}
            onValueChange={(v) => v && kb.setIndexStatusFilter(v as typeof kb.indexStatusFilter)}
          >
            <SelectTrigger className="h-8 w-full sm:w-[140px] text-sm">
              <SelectValue placeholder="索引状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部索引状态</SelectItem>
              <SelectItem value="ready">已索引 / 已校正</SelectItem>
              <SelectItem value="partial">书目待补 / 无文本层</SelectItem>
              <SelectItem value="unindexed">未索引</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={kb.doiFilter}
            onValueChange={(v) => v && kb.setDoiFilter(v as typeof kb.doiFilter)}
          >
            <SelectTrigger className="h-8 w-full sm:w-[120px] text-sm">
              <SelectValue placeholder="DOI" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部 DOI</SelectItem>
              <SelectItem value="has">有 DOI</SelectItem>
              <SelectItem value="missing">无 DOI</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
