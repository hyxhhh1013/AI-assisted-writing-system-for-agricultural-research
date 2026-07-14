"use client";

import { useState } from "react";
import {
  FlaskConical, FileText, Database, Pencil, Trash2, Plus,
  ChevronDown, ChevronRight, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  computeAssetFieldCompleteness,
  isAssetStructurallyComplete,
} from "@/lib/direction-asset-health";
import type { DirectionAsset, ExperimentAsset, PaperAsset, DatasetAsset } from "@/contracts/direction";

// ==================== 类型 ====================

type AssetKind = "experiment" | "paper" | "dataset";

interface ColumnConfig {
  kind: AssetKind;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  emptyHint: string;
}

interface DirectionAssetListProps {
  assets: DirectionAsset[];
  onEdit: (asset: DirectionAsset) => void;
  onDelete: (assetId: string) => void;
  onAdd: (kind: AssetKind) => void;
}

// ==================== 列配置 ====================

const COLUMNS: ColumnConfig[] = [
  {
    kind: "experiment",
    label: "实验/试验",
    icon: FlaskConical,
    accentColor: "text-[#2563eb]",
    accentBg: "bg-[#2563eb]/8",
    accentBorder: "border-[#2563eb]/20",
    emptyHint: "录入实验资产：研究问题、方法、关键发现",
  },
  {
    kind: "paper",
    label: "已发表论文",
    icon: FileText,
    accentColor: "text-[#1a5632]",
    accentBg: "bg-[#1a5632]/8",
    accentBorder: "border-[#1a5632]/20",
    emptyHint: "录入已发表论文：DOI、期刊、贡献",
  },
  {
    kind: "dataset",
    label: "数据集",
    icon: Database,
    accentColor: "text-[#b8975a]",
    accentBg: "bg-[#b8975a]/8",
    accentBorder: "border-[#b8975a]/20",
    emptyHint: "录入数据集：变量、样本量、关联实验",
  },
];

const SOURCE_LABELS: Record<string, string> = {
  knowledge_base: "知识库",
  existing_project: "已有项目",
  manual: "手动",
};

function CompletenessDot({ asset }: { asset: DirectionAsset }) {
  const score = computeAssetFieldCompleteness(asset);
  const complete = isAssetStructurallyComplete(asset);
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        complete ? "bg-[#059669]" : score >= 50 ? "bg-[#d97706]" : "bg-[#dc2626]",
      )}
      title={complete ? "必填完整" : `完整度 ${score}%`}
    />
  );
}

// ==================== 主组件 ====================

export function DirectionAssetList({ assets, onEdit, onDelete, onAdd }: DirectionAssetListProps) {
  const grouped = (kind: AssetKind) => assets.filter((a) => a.kind === kind);

  if (assets.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <div
            key={col.kind}
            className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#1a5632]/12 py-12 text-center"
          >
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", col.accentBg)}>
              <col.icon className={cn("h-5 w-5", col.accentColor)} />
            </div>
            <div>
              <p className="text-sm font-medium text-[#9aa8a0]">{col.label}</p>
              <p className="mt-1 text-xs text-[#b8c4bc]">{col.emptyHint}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => onAdd(col.kind)}
            >
              <Plus className="h-3 w-3" />
              添加{col.label}
            </Button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const items = grouped(col.kind);
        const hasItems = items.length > 0;
        const Icon = col.icon;

        return (
          <div
            key={col.kind}
            className={cn(
              "flex flex-col rounded-xl border min-h-[200px]",
              hasItems ? "border-[#1a5632]/8 bg-white" : "border-dashed border-[#1a5632]/12 bg-white/50",
            )}
          >
            {/* 列头 */}
            <div className={cn(
              "flex items-center justify-between px-4 py-2.5 border-b shrink-0",
              hasItems ? "border-[#1a5632]/6 bg-[#f6f5f1]/60" : "border-transparent",
            )}>
              <div className="flex items-center gap-2">
                <div className={cn("flex h-6 w-6 items-center justify-center rounded-md", col.accentBg)}>
                  <Icon className={cn("h-3.5 w-3.5", col.accentColor)} />
                </div>
                <span className="text-xs font-semibold text-[#122820]">{col.label}</span>
                {hasItems && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[9px] border-0 bg-black/[0.04] text-[#6b7c72]">
                    {items.length}
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onAdd(col.kind)}
                title={`添加${col.label}`}
              >
                <Plus className={cn("h-3.5 w-3.5", col.accentColor)} />
              </Button>
            </div>

            {/* 卡片列表 */}
            {hasItems ? (
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5 max-h-[480px]">
                {items.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    kind={col.kind}
                    accentColor={col.accentColor}
                    accentBg={col.accentBg}
                    accentBorder={col.accentBorder}
                    onEdit={() => onEdit(asset)}
                    onDelete={() => onDelete(asset.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4 text-center">
                <p className="text-xs text-[#b8c4bc]">{col.emptyHint}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ==================== 资产卡片 ====================

function AssetCard({
  asset,
  kind,
  accentColor,
  accentBg,
  accentBorder,
  onEdit,
  onDelete,
}: {
  asset: DirectionAsset;
  kind: AssetKind;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (kind === "experiment") return (
    <ExperimentCard
      asset={asset as ExperimentAsset}
      {...{ accentColor, accentBg, accentBorder, expanded, setExpanded, confirming, setConfirming, onEdit, onDelete }}
    />
  );
  if (kind === "paper") return (
    <PaperCard
      asset={asset as PaperAsset}
      {...{ accentColor, accentBg, accentBorder, expanded, setExpanded, confirming, setConfirming, onEdit, onDelete }}
    />
  );
  return (
    <DatasetCard
      asset={asset as DatasetAsset}
      {...{ accentColor, accentBg, accentBorder, expanded, setExpanded, confirming, setConfirming, onEdit, onDelete }}
    />
  );
}

// ==================== 基础卡片壳 ====================

function CardShell({
  accentBorder,
  accentBg,
  expanded,
  setExpanded,
  confirming,
  setConfirming,
  onEdit,
  onDelete,
  topLine,
  detailLines,
  badges,
}: {
  accentBorder: string;
  accentBg: string;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  topLine: React.ReactNode;
  detailLines: React.ReactNode;
  badges: React.ReactNode;
}) {
  const hasDetail = detailLines !== null;

  return (
    <div className={cn(
      "group rounded-lg border px-2.5 py-2 transition-colors hover:shadow-sm",
      accentBorder, expanded && accentBg,
    )}>
      {/* 第一行：标题 + 操作 */}
      <div className="flex items-start justify-between gap-1">
        <button
          className="flex-1 min-w-0 text-left"
          onClick={() => hasDetail && setExpanded(!expanded)}
        >
          {topLine}
        </button>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit}>
            <Pencil className="h-3 w-3 text-[#6b7c72]" />
          </Button>
          {confirming ? (
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-[10px] text-red-600"
                onClick={() => { onDelete(); setConfirming(false); }}
              >
                确认
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-[10px]"
                onClick={() => setConfirming(false)}
              >
                取消
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setConfirming(true)}>
              <Trash2 className="h-3 w-3 text-[#b91c1c]/60" />
            </Button>
          )}
        </div>
      </div>

      {/* 徽章行 */}
      {badges && <div className="mt-1 flex flex-wrap gap-1">{badges}</div>}

      {/* 展开详情 */}
      {expanded && hasDetail && (
        <div className="mt-2 border-t border-[#1a5632]/8 pt-2 space-y-1">
          {detailLines}
        </div>
      )}

      {/* 展开指示器 */}
      {hasDetail && (
        <button
          className="mt-1 flex w-full items-center justify-center text-[9px] text-[#b8c4bc] hover:text-[#6b7c72]"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      )}
    </div>
  );
}

// ==================== 实验卡片 ====================

function ExperimentCard({
  asset,
  ...shell
}: {
  asset: ExperimentAsset;
  accentColor: string; accentBg: string; accentBorder: string;
  expanded: boolean; setExpanded: (v: boolean) => void;
  confirming: boolean; setConfirming: (v: boolean) => void;
  onEdit: () => void; onDelete: () => void;
}) {
  return (
    <CardShell
      {...shell}
      topLine={
        <div className="flex items-start gap-1.5">
          <CompletenessDot asset={asset} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[#122820] line-clamp-2 leading-snug">
              {asset.title || "未命名实验"}
            </p>
            {asset.dateRange && (
              <p className="mt-0.5 text-[10px] text-[#9aa8a0]">{asset.dateRange}</p>
            )}
          </div>
        </div>
      }
      detailLines={
        <>
          {asset.researchQuestion && (
            <div>
              <span className="text-[9px] font-medium text-[#9aa8a0]">研究问题</span>
              <p className="text-[11px] text-[#3d4f46] leading-relaxed">{asset.researchQuestion}</p>
            </div>
          )}
          {asset.keyFindings && (
            <div>
              <span className="text-[9px] font-medium text-[#9aa8a0]">关键发现</span>
              <p className="text-[11px] text-[#3d4f46] leading-relaxed">{asset.keyFindings}</p>
            </div>
          )}
        </>
      }
      badges={
        <>
          {asset.isNegativeResult && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px] border-amber-200 bg-amber-50 text-amber-700">负结果</Badge>
          )}
          {asset.linkedPapers?.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px] border-0 bg-black/[0.03] text-[#6b7c72]">
              <ExternalLink className="mr-0.5 h-2.5 w-2.5" />
              {asset.linkedPapers.length} 篇论文
            </Badge>
          )}
        </>
      }
    />
  );
}

// ==================== 论文卡片 ====================

function PaperCard({
  asset,
  ...shell
}: {
  asset: PaperAsset;
  accentColor: string; accentBg: string; accentBorder: string;
  expanded: boolean; setExpanded: (v: boolean) => void;
  confirming: boolean; setConfirming: (v: boolean) => void;
  onEdit: () => void; onDelete: () => void;
}) {
  return (
    <CardShell
      {...shell}
      topLine={
        <div className="flex items-start gap-1.5">
          <CompletenessDot asset={asset} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[#122820] line-clamp-2 leading-snug">
              {asset.title || asset.doi || "未命名论文"}
            </p>
            {(asset.journal || asset.year) && (
              <p className="mt-0.5 text-[10px] text-[#9aa8a0]">
                {[asset.journal, asset.year ? String(asset.year) : ""].filter(Boolean).join(" · ")}
                {asset.impactFactor ? ` (IF ${asset.impactFactor})` : ""}
              </p>
            )}
          </div>
        </div>
      }
      detailLines={
        <>
          {asset.contribution && (
            <div>
              <span className="text-[9px] font-medium text-[#9aa8a0]">贡献</span>
              <p className="text-[11px] text-[#3d4f46] leading-relaxed">{asset.contribution}</p>
            </div>
          )}
          {asset.abstract && (
            <div>
              <span className="text-[9px] font-medium text-[#9aa8a0]">摘要</span>
              <p className="text-[11px] text-[#3d4f46] leading-relaxed line-clamp-4">{asset.abstract}</p>
            </div>
          )}
        </>
      }
      badges={
        <>
          {asset.source && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px] border-0 bg-black/[0.03] text-[#6b7c72]">
              {SOURCE_LABELS[asset.source] || asset.source}
            </Badge>
          )}
          {asset.linkedExperiments?.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px] border-0 bg-black/[0.03] text-[#6b7c72]">
              <ExternalLink className="mr-0.5 h-2.5 w-2.5" />
              {asset.linkedExperiments.length} 个实验
            </Badge>
          )}
        </>
      }
    />
  );
}

// ==================== 数据集卡片 ====================

function DatasetCard({
  asset,
  ...shell
}: {
  asset: DatasetAsset;
  accentColor: string; accentBg: string; accentBorder: string;
  expanded: boolean; setExpanded: (v: boolean) => void;
  confirming: boolean; setConfirming: (v: boolean) => void;
  onEdit: () => void; onDelete: () => void;
}) {
  return (
    <CardShell
      {...shell}
      topLine={
        <div className="flex items-start gap-1.5">
          <CompletenessDot asset={asset} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[#122820] line-clamp-2 leading-snug">
              {asset.title || "未命名数据集"}
            </p>
            {asset.sampleSize && (
              <p className="mt-0.5 text-[10px] text-[#9aa8a0]">样本量 {asset.sampleSize}</p>
            )}
          </div>
        </div>
      }
      detailLines={
        <>
          {asset.variables && (
            <div>
              <span className="text-[9px] font-medium text-[#9aa8a0]">变量</span>
              <p className="text-[11px] text-[#3d4f46] leading-relaxed">{asset.variables}</p>
            </div>
          )}
          {asset.filePath && (
            <div>
              <span className="text-[9px] font-medium text-[#9aa8a0]">文件路径</span>
              <p className="text-[11px] text-[#6b7c72] font-mono text-[10px]">{asset.filePath}</p>
            </div>
          )}
        </>
      }
      badges={
        <>
          {asset.source && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px] border-0 bg-black/[0.03] text-[#6b7c72]">
              {SOURCE_LABELS[asset.source] || asset.source}
            </Badge>
          )}
          {asset.linkedExperiments?.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px] border-0 bg-black/[0.03] text-[#6b7c72]">
              <ExternalLink className="mr-0.5 h-2.5 w-2.5" />
              {asset.linkedExperiments.length} 个实验
            </Badge>
          )}
        </>
      }
    />
  );
}
