"use client";

import { Compass, Archive, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { siteTheme } from "@/lib/site-theme";
import { cn } from "@/lib/utils";
import type { DirectionListItem } from "@/contracts/direction";

interface DirectionCardProps {
  direction: DirectionListItem;
  onClick: (slug: string) => void;
}

export function DirectionCard({ direction, onClick }: DirectionCardProps) {
  const isArchived = direction.status === "archived";

  return (
    <Card
      className={cn(
        "group cursor-pointer border-l-4 transition-all duration-200",
        isArchived
          ? "border-l-[#9aa8a0] opacity-70"
          : "border-l-[#1a5632]",
        siteTheme.card,
        siteTheme.cardHover,
      )}
      onClick={() => onClick(direction.slug)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
              isArchived
                ? "bg-[#9aa8a0]/10"
                : "bg-[#1a5632]/8",
              "group-hover:opacity-90",
            )}
          >
            {isArchived ? (
              <Archive className="h-5 w-5 text-[#9aa8a0]" />
            ) : (
              <Compass className="h-5 w-5 text-[#1a5632]" />
            )}
          </div>
          <ChevronRight
            className={cn(
              "h-4 w-4 transition-transform group-hover:translate-x-0.5",
              isArchived ? "text-[#9aa8a0]" : "text-[#1a5632]",
            )}
          />
        </div>
        <CardTitle
          className={cn(
            "mt-3 line-clamp-1 text-base leading-snug",
            isArchived ? "text-[#9aa8a0]" : "text-[#122820]",
          )}
        >
          {direction.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {direction.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-[#6b7c72]">
            {direction.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {direction.categories.map((cat) => (
            <Badge
              key={cat}
              variant="secondary"
              className="h-5 px-1.5 text-[10px] font-normal bg-[#1a5632]/6 text-[#1a5632] border-0"
            >
              {cat}
            </Badge>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs text-[#9aa8a0]">
          <span>
            {direction.assetCount} 项资产
          </span>
          {isArchived && (
            <span className="inline-flex items-center gap-1 text-[#b8975a]">
              <Archive className="h-3 w-3" />
              已归档
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
