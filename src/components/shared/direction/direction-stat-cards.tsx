"use client";

import { FlaskConical, FileText, Database, BookOpen } from "lucide-react";
import type { DirectionAsset } from "@/contracts/direction";
import { cn } from "@/lib/utils";

interface DirectionStatCardsProps {
  assets: DirectionAsset[];
  literatureCount?: number;
}

interface StatCardData {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}

export function DirectionStatCards({ assets, literatureCount }: DirectionStatCardsProps) {
  const experiments = assets.filter((a) => a.kind === "experiment").length;
  const papers = assets.filter((a) => a.kind === "paper").length;
  const datasets = assets.filter((a) => a.kind === "dataset").length;

  const cards: StatCardData[] = [
    { label: "实验/试验", value: experiments, icon: FlaskConical, color: "text-[#2563eb]", bgColor: "bg-[#2563eb]/8" },
    { label: "已发表论文", value: papers, icon: FileText, color: "text-[#1a5632]", bgColor: "bg-[#1a5632]/8" },
    { label: "数据集", value: datasets, icon: Database, color: "text-[#b8975a]", bgColor: "bg-[#b8975a]/8" },
    { label: "知识库文献", value: literatureCount ?? 0, icon: BookOpen, color: "text-[#6366f1]", bgColor: "bg-[#6366f1]/8" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex items-center gap-3 rounded-xl border border-[#1a5632]/8 bg-white px-4 py-3"
        >
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", card.bgColor)}>
            <card.icon className={cn("h-4.5 w-4.5", card.color)} />
          </div>
          <div>
            <p className="text-lg font-semibold tabular-nums text-[#122820]">{card.value}</p>
            <p className="text-[11px] text-[#9aa8a0]">{card.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
