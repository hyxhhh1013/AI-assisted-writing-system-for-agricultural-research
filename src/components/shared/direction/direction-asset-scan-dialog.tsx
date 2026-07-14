"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, Database, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { siteTheme } from "@/lib/site-theme";
import { toast } from "sonner";
import { scanCandidates, type ScanResult } from "@/services/direction";
import { isAssetAlreadyImported } from "@/lib/direction-asset-health";
import type { DirectionAsset } from "@/contracts/direction";

interface DirectionAssetScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  existingAssets?: DirectionAsset[];
  onImport: (assets: DirectionAsset[]) => void;
}

export function DirectionAssetScanDialog({
  open,
  onOpenChange,
  slug,
  existingAssets = [],
  onImport,
}: DirectionAssetScanDialogProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<string>>(new Set());
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setLoading(true);
      setResult(null);
      setSelectedPaperIds(new Set());
      setSelectedDatasetIds(new Set());
      scanCandidates(slug)
        .then(setResult)
        .catch((err) => toast.error(err instanceof Error ? err.message : "扫描失败"))
        .finally(() => setLoading(false));
    }
  }, [open, slug]);

  const allPapers = [
    ...(result?.paperCandidates || []),
    ...(result?.projectCandidates || []),
  ].filter((p) => !isAssetAlreadyImported(p, existingAssets));

  const filteredDatasets = (result?.datasetCandidates || []).filter(
    (d) => !existingAssets.some(
      (a) => a.kind === "dataset" && a.title.trim().toLowerCase() === d.title.trim().toLowerCase(),
    ),
  );

  const handleImport = () => {
    const assets: DirectionAsset[] = [];

    for (const p of allPapers) {
      if (selectedPaperIds.has(p.id)) {
        assets.push({
          id: `imported-paper-${p.id}`,
          kind: "paper",
          doi: p.doi,
          title: p.title,
          journal: p.journal,
          year: p.year,
          impactFactor: p.impactFactor,
          abstract: p.abstract || "",
          contribution: "",
          linkedExperiments: [],
          source: p.source,
          createdAt: 0,
          updatedAt: 0,
        });
      }
    }

    for (const d of filteredDatasets) {
      if (selectedDatasetIds.has(d.id)) {
        assets.push({
          id: `imported-dataset-${d.id}`,
          kind: "dataset",
          title: d.title,
          variables: d.variables,
          sampleSize: d.sampleSize,
          linkedExperiments: [],
          source: "existing_data_claims",
          createdAt: 0,
          updatedAt: 0,
        });
      }
    }

    if (assets.length === 0) {
      toast.error("请至少选择一项资产");
      return;
    }

    onImport(assets);
    onOpenChange(false);
    toast.success(`已导入 ${assets.length} 项资产`);
  };

  const togglePaper = (id: string) => {
    const next = new Set(selectedPaperIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedPaperIds(next);
  };

  const toggleDataset = (id: string) => {
    const next = new Set(selectedDatasetIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedDatasetIds(next);
  };

  const selectAllPapers = () => {
    if (selectedPaperIds.size === allPapers.length) {
      setSelectedPaperIds(new Set());
    } else {
      setSelectedPaperIds(new Set(allPapers.map((p) => p.id)));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl overflow-hidden sm:max-w-2xl">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle>从现有数据扫描资产</DialogTitle>
          <DialogDescription>
            自动从知识库文献和现有项目中识别可导入的论文和数据集资产。
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[#1a5632]" />
            <span className="ml-2 text-sm text-[#6b7c72]">正在扫描...</span>
          </div>
        ) : result ? (
          <div className="min-w-0 space-y-4 overflow-hidden">
            {/* 摘要 */}
            <div className="flex flex-wrap gap-3 text-xs text-[#6b7c72]">
              <span>可导入论文: {allPapers.length} 篇</span>
              <span>可导入数据集: {filteredDatasets.length} 条</span>
              {(result.summary.knowledgeBasePapers > allPapers.length ||
                (result?.datasetCandidates || []).length > filteredDatasets.length) && (
                <span className="text-[#059669]">已过滤重复项</span>
              )}
            </div>

            <ScrollArea className="h-[320px] min-w-0 w-full">
              <div className="min-w-0 space-y-4 pr-3">
              {/* 论文候选 */}
              {allPapers.length > 0 && (
                <div className="mb-4 min-w-0">
                  <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                    <h4 className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-[#122820]">
                      <FileText className="h-4 w-4 shrink-0 text-[#1a5632]" />
                      <span className="truncate">论文资产 ({allPapers.length})</span>
                    </h4>
                    <Button variant="ghost" size="sm" className="h-6 shrink-0 text-xs" onClick={selectAllPapers}>
                      {selectedPaperIds.size === allPapers.length ? "取消全选" : "全选"}
                    </Button>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    {allPapers.map((p) => (
                      <label
                        key={p.id}
                        className={cn(
                          "flex min-w-0 items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                          selectedPaperIds.has(p.id)
                            ? "border-[#1a5632]/30 bg-[#1a5632]/4"
                            : "border-transparent hover:bg-black/[0.02]",
                        )}
                      >
                        <Checkbox
                          checked={selectedPaperIds.has(p.id)}
                          onCheckedChange={() => togglePaper(p.id)}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p className="break-words text-sm leading-snug text-[#122820] line-clamp-2 [overflow-wrap:anywhere]">
                            {p.title}
                          </p>
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                            {p.journal && (
                              <span className="min-w-0 break-words text-[11px] text-[#6b7c72] [overflow-wrap:anywhere]">
                                {p.journal}
                              </span>
                            )}
                            {p.year > 0 && (
                              <span className="shrink-0 text-[11px] text-[#9aa8a0]">{p.year}</span>
                            )}
                            <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[9px] font-normal">
                              {p.source === "knowledge_base" ? "知识库" : "已有项目"}
                            </Badge>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* 数据集候选 */}
              {(filteredDatasets).length > 0 && (
                <div className="min-w-0">
                  <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[#122820]">
                    <Database className="h-4 w-4 shrink-0 text-[#b8975a]" /> 数据集资产 ({filteredDatasets.length})
                  </h4>
                  <div className="min-w-0 space-y-1.5">
                    {filteredDatasets.map((d) => (
                      <label
                        key={d.id}
                        className={cn(
                          "flex min-w-0 items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                          selectedDatasetIds.has(d.id)
                            ? "border-[#b8975a]/30 bg-[#b8975a]/4"
                            : "border-transparent hover:bg-black/[0.02]",
                        )}
                      >
                        <Checkbox
                          checked={selectedDatasetIds.has(d.id)}
                          onCheckedChange={() => toggleDataset(d.id)}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p className="break-words text-sm leading-snug text-[#122820] line-clamp-2 [overflow-wrap:anywhere]">
                            {d.title}
                          </p>
                          <p className="mt-0.5 break-words text-[11px] text-[#6b7c72] line-clamp-1 [overflow-wrap:anywhere]">
                            {d.variables}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {allPapers.length === 0 && filteredDatasets.length === 0 && (
                <div className="py-12 text-center text-sm text-[#9aa8a0]">
                  {existingAssets.length > 0
                    ? "未发现新的可导入资产（已有资产均已收录）。"
                    : "未找到可导入的资产。请确保知识库中存在该方向分类的文献，或已有项目关联了此研究方向。"}
                </div>
              )}
              </div>
            </ScrollArea>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleImport}
            disabled={loading || (selectedPaperIds.size === 0 && selectedDatasetIds.size === 0)}
            className={cn("gap-1.5", siteTheme.btnPrimary)}
          >
            <Search className="h-3.5 w-3.5" />
            导入选中资产 ({selectedPaperIds.size + selectedDatasetIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
