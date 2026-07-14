"use client";

import { GitBranch, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CrossDirectionOpportunity } from "@/contracts/direction";

interface DirectionCrossOpportunitiesProps {
  opportunities: CrossDirectionOpportunity[];
}

export function DirectionCrossOpportunities({ opportunities }: DirectionCrossOpportunitiesProps) {
  if (!opportunities.length) return null;

  return (
    <div className="rounded-lg border border-[#6366f1]/15 bg-[#6366f1]/[0.03] p-4">
      <h4 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-[#6366f1]">
        <GitBranch className="h-4 w-4" /> 跨方向协同（D8）
      </h4>
      <div className="space-y-2">
        {opportunities.map((opp) => (
          <div
            key={opp.directionSlug}
            className="rounded-md border border-[#6366f1]/10 bg-white px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <a
                href={`/directions/${opp.directionSlug}`}
                className="flex items-center gap-1 text-xs font-semibold text-[#6366f1] hover:underline"
              >
                {opp.directionSlug}
                <ExternalLink className="h-3 w-3" />
              </a>
              <Badge variant="outline" className="h-4 px-1 text-[9px]">
                {opp.confidence === "high" ? "高置信" : opp.confidence === "medium" ? "中" : "低"}
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[#3d4f46]">{opp.description}</p>
            {opp.synergyPoints.length > 0 && (
              <ul className="mt-1.5 list-inside list-disc text-[10px] text-[#6b7c72]">
                {opp.synergyPoints.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
