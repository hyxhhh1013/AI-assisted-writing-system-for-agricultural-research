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
import { scanCandidates } from "@/services/direction";
import type { ScanResult } from "@/services/direction";
import type { DirectionAsset } from "@/contracts/direction";

interface DirectionAssetScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  onImport: (assets: DirectionAsset[]) => void;
}

export function DirectionAssetScanDialog({
  open,
  onOpenChange,
  slug,
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
  ];

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

    for (const d of result?.datasetCandidates || []) {
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
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
          <div className="space-y-4">
            {/* 摘要 */}
            <div className="flex gap-3 text-xs text-[#6b7c72]">
              <span>知识库文献: {result.summary.knowledgeBasePapers} 篇</span>
              <span>现有项目: {result.summary.existingProjects} 个</span>
              <span>数据声明: {result.summary.dataClaims} 条</span>
            </div>

            <ScrollArea className="h-[320px]">
              {/* 论文候选 */}
              {allPapers.length > 0 && (
                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="flex items-center gap-1.5 text-sm font-medium text-[#122820]">
                      <FileText className="h-4 w-4 text-[#1a5632]" /> 论文资产 ({allPapers.length})
                    </h4>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={selectAllPapers}>
                      {selectedPaperIds.size === allPapers.length ? "取消全选" : "全选"}
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    {allPapers.map((p) => (
                      <label
                        key={p.id}
                        className={cn(
                          "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                          selectedPaperIds.has(p.id)
                            ? "border-[#1a5632]/30 bg-[#1a5632]/4"
                            : "border-transparent hover:bg-black/[0.02]",
                        )}
                      >
                        <Checkbox
                          checked={selectedPaperIds.has(p.id)}
                          onCheckedChange={() => togglePaper(p.id)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-snug text-[#122820] line-clamp-2">{p.title}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {p.journal && (
                              <span className="text-[11px] text-[#6b7c72]">{p.journal}</span>
                            )}
                            {p.year > 0 && (
                              <span className="text-[11px] text-[#9aa8a0]">{p.year}</span>
                            )}
                            <Badge variant="secondary" className="h-4 px-1 text-[9px] font-normal">
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
              {(result?.datasetCandidates || []).length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[#122820]">
                    <Database className="h-4 w-4 text-[#b8975a]" /> 数据集资产 ({result.datasetCandidates.length})
                  </h4>
                  <div className="space-y-1.5">
                    {result.datasetCandidates.map((d) => (
                      <label
                        key={d.id}
                        className={cn(
                          "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                          selectedDatasetIds.has(d.id)
                            ? "border-[#b8975a]/30 bg-[#b8975a]/4"
                            : "border-transparent hover:bg-black/[0.02]",
                        )}
                      >
                        <Checkbox
                          checked={selectedDatasetIds.has(d.id)}
                          onCheckedChange={() => toggleDataset(d.id)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-snug text-[#122820] line-clamp-2">{d.title}</p>
                          <p className="mt-0.5 text-[11px] text-[#6b7c72] line-clamp-1">{d.variables}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {allPapers.length === 0 && (result?.datasetCandidates || []).length === 0 && (
                <div className="py-12 text-center text-sm text-[#9aa8a0]">
                  未找到可导入的资产。请确保知识库中存在该方向分类的文献，或已有项目关联了此研究方向。
                </div>
              )}
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
