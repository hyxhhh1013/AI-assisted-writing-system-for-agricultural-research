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

const kindCfg = {
  experiment: { label: "实验", icon: FlaskConical, color: "text-[#2563eb]", bg: "bg-[#2563eb]/8", border: "border-l-[#2563eb]" },
  paper: { label: "论文", icon: FileText, color: "text-[#1a5632]", bg: "bg-[#1a5632]/8", border: "border-l-[#1a5632]" },
  dataset: { label: "数据集", icon: Database, color: "text-[#b8975a]", bg: "bg-[#b8975a]/8", border: "border-l-[#b8975a]" },
} as const;

type Kind = keyof typeof kindCfg;

export function DirectionAssetList({ assets, onEdit, onDelete }: DirectionAssetListProps) {
  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1a5632]/6">
          <Database className="h-6 w-6 text-[#1a5632]/50" />
        </div>
        <p className="text-sm text-[#9aa8a0]">暂无资产。录入或从现有数据扫描。</p>
      </div>
    );
  }

  // 按 kind 分组排序
  const order: Kind[] = ["experiment", "paper", "dataset"];
  const grouped = (kind: Kind) => assets.filter((a) => a.kind === kind);

  return (
    <div className="space-y-6">
      {order.map((kind) => {
        const items = grouped(kind);
        if (items.length === 0) return null;
        const cfg = kindCfg[kind];
        const Icon = cfg.icon;

        return (
          <div key={kind}>
            {/* 分组头 */}
            <div className={cn("mb-2 flex items-center gap-2 text-xs font-semibold", cfg.color)}>
              <Icon className="h-4 w-4" />
              {cfg.label}
              <Badge variant="secondary" className="h-4 px-1.5 text-[9px] border-0 bg-black/[0.04] text-[#6b7c72]">
                {items.length}
              </Badge>
            </div>

            {/* 紧凑表格 */}
            <div className="overflow-hidden rounded-lg border border-[#1a5632]/8">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1a5632]/6 bg-[#f6f5f1]/70 text-left text-[10px] font-medium text-[#9aa8a0]">
                    <th className="w-8 px-2 py-1.5" />
                    <th className="px-3 py-1.5">名称</th>
                    <th className="hidden px-3 py-1.5 sm:table-cell">关键信息</th>
                    <th className="hidden w-24 px-3 py-1.5 text-right lg:table-cell">标签</th>
                    <th className="w-16 px-2 py-1.5 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((asset) => (
                    <AssetTableRow
                      key={asset.id}
                      asset={asset}
                      kind={kind}
                      onEdit={() => onEdit(asset)}
                      onDelete={() => onDelete(asset.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AssetTableRow({
  asset,
  kind,
  onEdit,
  onDelete,
}: {
  asset: DirectionAsset;
  kind: Kind;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cfg = kindCfg[kind];
  const Icon = cfg.icon;

  const title =
    asset.kind === "experiment" ? (asset as { title: string }).title
      : asset.kind === "paper" ? ((asset as { title: string }).title || (asset as { doi: string }).doi)
        : (asset as { title: string }).title;

  const subtitle =
    asset.kind === "experiment"
      ? ((asset as { researchQuestion: string }).researchQuestion || "").slice(0, 50)
      : asset.kind === "paper"
        ? `${(asset as { journal: string }).journal || ""}${(asset as { year: number }).year ? ` (${(asset as { year: number }).year})` : ""}`
        : ((asset as { variables: string }).variables || "").slice(0, 50);

  const badges: string[] = [];
  if (asset.kind === "experiment" && (asset as { isNegativeResult: boolean }).isNegativeResult) {
    badges.push("负结果");
  }
  if (asset.kind === "paper" && (asset as { source: string }).source) {
    const s = (asset as { source: string }).source;
    badges.push(s === "knowledge_base" ? "知识库" : s === "existing_project" ? "已有项目" : "手动");
  }

  return (
    <tr className="group border-b border-[#1a5632]/4 transition-colors hover:bg-[#1a5632]/2">
      {/* 类型图标 */}
      <td className="px-2 py-2">
        <div className={cn("flex h-6 w-6 items-center justify-center rounded-md", cfg.bg)}>
          <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
        </div>
      </td>

      {/* 名称 + 副标题 */}
      <td className="px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-[#122820]" title={title}>
            {title || "未命名"}
          </p>
          {subtitle && (
            <p className="mt-0.5 truncate text-[10px] text-[#9aa8a0]">
              {subtitle}
            </p>
          )}
        </div>
      </td>

      {/* 关键信息 */}
      <td className="hidden px-3 py-2 sm:table-cell">
        <span className="line-clamp-1 text-[11px] text-[#6b7c72]">
          {asset.kind === "experiment"
            ? (asset as { keyFindings: string }).keyFindings?.slice(0, 60) || "—"
            : asset.kind === "paper"
              ? (asset as { contribution: string }).contribution?.slice(0, 60) || "—"
              : (asset as { sampleSize: string }).sampleSize || "—"}
        </span>
      </td>

      {/* 标签 */}
      <td className="hidden px-3 py-2 text-right lg:table-cell">
        <div className="flex justify-end gap-1">
          {badges.map((b) => (
            <Badge key={b} variant="secondary" className="h-4 px-1 text-[9px] leading-none font-normal border-0 bg-[#f3f4f6] text-[#6b7c72]">
              {b}
            </Badge>
          ))}
        </div>
      </td>

      {/* 操作 */}
      <td className="px-2 py-2 text-right">
        <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5 text-[#6b7c72]" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => { e.stopPropagation(); if (confirm("确定删除？")) onDelete(); }}
          >
            <Trash2 className="h-3.5 w-3.5 text-[#b91c1c]/70" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
