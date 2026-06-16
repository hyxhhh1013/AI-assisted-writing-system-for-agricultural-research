"use client";

import type { ElementType } from "react";
import { BarChart3 } from "lucide-react";

export interface ChartFigureOption {
  id: string;
  name: string;
  description?: string;
  icon?: ElementType;
}

interface ChartTypeStripProps {
  figures: ChartFigureOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function ChartTypeStrip({ figures, selectedId, onSelect }: ChartTypeStripProps) {
  return (
    <div className="shrink-0 border-b border-[#1a5632]/10 bg-white px-4 py-2.5">
      <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
        {figures.map((fig) => {
          const Icon = fig.icon ?? BarChart3;
          const active = fig.id === selectedId;
          return (
            <button
              key={fig.id}
              type="button"
              onClick={() => onSelect(fig.id)}
              title={fig.description}
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all ${
                active
                  ? "border-[#1a5632] bg-[#1a5632] text-white shadow-sm"
                  : "border-[#1a5632]/12 bg-[#faf9f6] text-[#3d4f46] hover:border-[#1a5632]/25 hover:bg-white"
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-[#1a5632]/60"}`}
              />
              <span className="whitespace-nowrap text-xs font-medium">{fig.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
