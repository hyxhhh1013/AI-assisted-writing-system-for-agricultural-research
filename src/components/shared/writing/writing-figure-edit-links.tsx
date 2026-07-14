"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BarChart3, ExternalLink } from "lucide-react";
import {
  detectedFigureToPlotHref,
  figureBlockJsonToPlotHref,
  figureToolToRegistryId,
} from "@/contracts/figure";
import { findFigureBlocks } from "@/hooks/use-figure-pipeline";

export interface WritingFigureEditItem {
  caption: string;
  tool: string;
  figureId: string;
  href: string;
}

export function collectWritingFigureEditItems(
  projectId: string,
  text: string,
  detectedFigures?: { tool: string; config: string; caption: string }[],
): WritingFigureEditItem[] {
  const byCaption = new Map<string, WritingFigureEditItem>();

  for (const block of findFigureBlocks(text)) {
    const href = figureBlockJsonToPlotHref(projectId, block.json);
    const tool = block.json.tool;
    const caption = block.json.caption;
    const config = block.json.config;
    if (
      typeof href !== "string"
      || typeof tool !== "string"
      || typeof caption !== "string"
      || !config
      || typeof config !== "object"
    ) {
      continue;
    }
    byCaption.set(caption, {
      caption,
      tool,
      figureId: figureToolToRegistryId(tool, config as Record<string, unknown>),
      href,
    });
  }

  for (const fig of detectedFigures ?? []) {
    const href = detectedFigureToPlotHref(projectId, fig);
    if (!href || byCaption.has(fig.caption)) continue;
    try {
      const config = JSON.parse(fig.config) as Record<string, unknown>;
      byCaption.set(fig.caption, {
        caption: fig.caption,
        tool: fig.tool,
        figureId: figureToolToRegistryId(fig.tool, config),
        href,
      });
    } catch {
      /* ignore malformed config */
    }
  }

  return Array.from(byCaption.values());
}

interface WritingFigureEditLinksProps {
  projectId: string;
  text: string;
  detectedFigures?: { tool: string; config: string; caption: string }[];
  compact?: boolean;
}

/** 扩写/编辑器中的 FIGURE 标记 →「在绘图页编辑」深链 */
export function WritingFigureEditLinks({
  projectId,
  text,
  detectedFigures,
  compact,
}: WritingFigureEditLinksProps) {
  const items = useMemo(
    () => collectWritingFigureEditItems(projectId, text, detectedFigures),
    [projectId, text, detectedFigures],
  );

  if (items.length === 0) return null;

  return (
    <div
      className={
        compact
          ? "rounded-md border border-[#1a5632]/15 bg-[#1a5632]/5 p-2"
          : "rounded-md border border-dashed border-[#1a5632]/25 bg-background/60 p-3"
      }
    >
      <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase text-[#1a5632]">
        <BarChart3 className="h-3 w-3" />
        配图可在绘图页编辑（{items.length}）
      </div>
      <ul className={compact ? "space-y-1" : "space-y-1.5"}>
        {items.map((item) => (
          <li key={`${item.caption}-${item.figureId}`} className="flex items-start gap-2">
            <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground" title={item.caption}>
              {item.caption}
            </span>
            <Link
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-[#1a5632] hover:underline"
            >
              绘图页
              <ExternalLink className="h-3 w-3" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
