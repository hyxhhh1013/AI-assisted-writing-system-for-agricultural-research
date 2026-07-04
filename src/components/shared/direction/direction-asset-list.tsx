"use client";

import { FlaskConical, FileText, Database, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DirectionAsset } from "@/contracts/direction";

interface DirectionAssetListProps {
  assets: DirectionAsset[];
  onEdit: (asset: DirectionAsset) => void;
  onDelete: (assetId: string) => void;
}

const kindConfig = {
  experiment: { label: "实验", icon: FlaskConical, color: "text-[#2563eb]", bg: "bg-[#2563eb]/8" },
  paper: { label: "论文", icon: FileText, color: "text-[#1a5632]", bg: "bg-[#1a5632]/8" },
  dataset: { label: "数据集", icon: Database, color: "text-[#b8975a]", bg: "bg-[#b8975a]/8" },
} as const;

export function DirectionAssetList({ assets, onEdit, onDelete }: DirectionAssetListProps) {
  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1a5632]/6">
          <Database className="h-6 w-6 text-[#1a5632]/50" />
        </div>
        <p className="text-sm text-[#9aa8a0]">暂无资产。点击上方按钮录入或从现有数据扫描。</p>
      </div>
    );
  }

  const grouped = {
    experiment: assets.filter((a) => a.kind === "experiment"),
    paper: assets.filter((a) => a.kind === "paper"),
    dataset: assets.filter((a) => a.kind === "dataset"),
  };

  return (
    <div className="space-y-4">
      {(["experiment", "paper", "dataset"] as const).map((kind) => {
        const items = grouped[kind];
        if (items.length === 0) return null;
        const config = kindConfig[kind];
        const Icon = config.icon;

        return (
          <div key={kind}>
            <h4 className={cn("mb-2 flex items-center gap-1.5 text-sm font-medium", config.color)}>
              <Icon className="h-4 w-4" />
              {config.label} ({items.length})
            </h4>
            <div className="space-y-2">
              {items.map((asset) => (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  onEdit={() => onEdit(asset)}
                  onDelete={() => onDelete(asset.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AssetRow({
  asset,
  onEdit,
  onDelete,
}: {
  asset: DirectionAsset;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const config = kindConfig[asset.kind];
  const Icon = config.icon;

  return (
    <div className="group flex items-start gap-3 rounded-lg border border-[#1a5632]/6 bg-white px-4 py-3 transition-colors hover:border-[#1a5632]/12">
      <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md", config.bg)}>
        <Icon className={cn("h-3.5 w-3.5", config.color)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-[#122820] line-clamp-1">
            {asset.kind === "experiment" && asset.title}
            {asset.kind === "paper" && (asset.title || asset.doi)}
            {asset.kind === "dataset" && asset.title}
          </p>
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 text-[#6b7c72]" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("确定删除此资产？")) onDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-[#b91c1c]/70" />
            </Button>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {asset.kind === "experiment" && (
            <>
              {(asset as { researchQuestion?: string }).researchQuestion && (
                <span className="text-[11px] text-[#6b7c72] line-clamp-1">
                  Q: {(asset as { researchQuestion: string }).researchQuestion}
                </span>
              )}
              {(asset as { isNegativeResult?: boolean }).isNegativeResult && (
                <Badge variant="secondary" className="h-4 gap-0.5 px-1 text-[9px] font-normal text-[#b8975a] border-0 bg-[#b8975a]/10">
                  <AlertTriangle className="h-2.5 w-2.5" /> 负结果
                </Badge>
              )}
            </>
          )}
          {asset.kind === "paper" && (
            <>
              {(asset as { journal?: string }).journal && (
                <span className="text-[11px] text-[#6b7c72]">
                  {(asset as { journal: string }).journal}
                  {(asset as { year?: number }).year ? ` (${(asset as { year: number }).year})` : ""}
                </span>
              )}
              {(asset as { source?: string }).source && (
                <Badge variant="secondary" className="h-4 px-1 text-[9px] font-normal">
                  {(asset as { source: string }).source === "knowledge_base" ? "知识库" : (asset as { source: string }).source === "existing_project" ? "已有项目" : "手动录入"}
                </Badge>
              )}
            </>
          )}
          {asset.kind === "dataset" && (
            <span className="text-[11px] text-[#6b7c72] line-clamp-1">
              {(asset as { variables?: string }).variables}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
