"use client";

import { FlaskConical, FileText, Database, BookOpen, Gauge } from "lucide-react";
import type { DirectionAsset, DirectionAnalysis } from "@/contracts/direction";
import { computeAssetInventoryHealth } from "@/lib/direction-asset-health";
import { cn } from "@/lib/utils";

interface DirectionStatCardsProps {
  assets: DirectionAsset[];
  literatureCount?: number;
  analysis?: DirectionAnalysis | null;
}

interface StatCardData {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}

export function DirectionStatCards({
  assets,
  literatureCount,
  analysis,
}: DirectionStatCardsProps) {
  const health = computeAssetInventoryHealth(assets, analysis);
  const { stats, completenessScore, readyForNextPhase } = health;

  const cards: StatCardData[] = [
    {
      label: "实验/试验",
      value: stats.experiments,
      sub: stats.negativeResults > 0 ? `${stats.negativeResults} 负结果` : undefined,
      icon: FlaskConical,
      color: "text-[#2563eb]",
      bgColor: "bg-[#2563eb]/8",
    },
    {
      label: "已发表论文",
      value: stats.papers,
      icon: FileText,
      color: "text-[#1a5632]",
      bgColor: "bg-[#1a5632]/8",
    },
    {
      label: "数据集",
      value: stats.datasets,
      icon: Database,
      color: "text-[#b8975a]",
      bgColor: "bg-[#b8975a]/8",
    },
    {
      label: "盘点完整度",
      value: `${completenessScore}%`,
      sub: readyForNextPhase ? "可进入预承诺" : stats.incompleteAssets > 0 ? `${stats.incompleteAssets} 项待补全` : "继续录入",
      icon: Gauge,
      color: completenessScore >= 80 ? "text-[#059669]" : completenessScore >= 50 ? "text-[#d97706]" : "text-[#dc2626]",
      bgColor: completenessScore >= 80 ? "bg-[#059669]/8" : completenessScore >= 50 ? "bg-[#d97706]/8" : "bg-[#dc2626]/8",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="flex items-center gap-3 rounded-xl border border-[#1a5632]/8 bg-white px-4 py-3"
          >
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", card.bgColor)}>
              <card.icon className={cn("h-4.5 w-4.5", card.color)} />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold tabular-nums text-[#122820]">{card.value}</p>
              <p className="text-[11px] text-[#9aa8a0] truncate">{card.label}</p>
              {card.sub && (
                <p className={cn("text-[10px] truncate", card.color)}>{card.sub}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      {literatureCount != null && literatureCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-[#6366f1]/15 bg-[#6366f1]/4 px-3 py-2 text-xs text-[#4338ca]">
          <BookOpen className="h-3.5 w-3.5 shrink-0" />
          <span>知识库关联分类下共有 {literatureCount} 篇文献，可通过扫描导入为论文资产</span>
        </div>
      )}
    </div>
  );
}
