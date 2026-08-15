"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, ImageIcon, Pencil, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { FigureReviseForm } from "@/components/shared/agent/figure-revise-form";
import type { FigureReviseFormValue, FigureReviseTarget } from "@/contracts/figure-revise";
import type { FigureDockItem } from "@/lib/agent/figure-dock";
import { withReplaceImageUrlParam } from "@/lib/agent/figure-dock";
import { formatFigurePlacementHint } from "@/lib/agent/figure-revise";
import { stashPlotPrefill } from "@/lib/plot-prefill-stash";
import { cn } from "@/lib/utils";

interface AgentFigureDockProps {
  items: FigureDockItem[];
  sectionLabelOf?: (sectionKey?: string) => string | undefined;
  disabled?: boolean;
  onRevise: (target: FigureReviseTarget, form: FigureReviseFormValue) => void;
  onJumpToSection?: (sectionKey: string) => void;
  projectId?: string;
}

/**
 * 贴在输入框上方的常驻配图坞：最近出图随时「按意见改」/进 /plot，无需翻聊天记录。
 */
export function AgentFigureDock({
  items,
  sectionLabelOf,
  disabled,
  onRevise,
  onJumpToSection,
  projectId,
}: AgentFigureDockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [revisingId, setRevisingId] = useState<string | null>(null);

  const active = useMemo(
    () => items.find((x) => x.id === (activeId ?? items[0]?.id)) ?? items[0],
    [items, activeId],
  );

  if (items.length === 0) return null;

  const plotHref = active
    ? withReplaceImageUrlParam(
        active.plotHref
          ?? (projectId && active.imageUrl
            ? `/plot?id=${encodeURIComponent(projectId)}`
            : undefined),
        active.imageUrl,
      )
    : undefined;

  return (
    <div className="shrink-0 border-t border-[#1a5632]/15 bg-white/95 px-3 py-2 shadow-[0_-4px_12px_rgba(18,40,32,0.04)]">
      <div className="mb-1.5 flex items-center gap-1.5">
        <ImageIcon className="h-3.5 w-3.5 text-[#1a5632]" />
        <span className="text-[11px] font-medium text-[#122820]">配图坞</span>
        <span className="text-[10px] text-muted-foreground">
          最近 {items.length} 张 · 免翻聊天
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-6 px-1.5 text-[10px]"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? "展开" : "收起"}
        </Button>
      </div>
      {!collapsed && active ? (
        <div className="space-y-2">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {items.map((item) => {
              const on = item.id === active.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveId(item.id);
                    setRevisingId(null);
                  }}
                  className={cn(
                    "h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-white transition-colors",
                    on
                      ? "border-[#1a5632] ring-1 ring-[#1a5632]/30"
                      : "border-border/50 hover:border-[#1a5632]/35",
                  )}
                  title={item.title || item.imageUrl}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.imageUrl}
                    alt={item.title || "figure"}
                    className="h-full w-full object-cover"
                  />
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.imageUrl}
              alt={active.title || "figure"}
              className="h-20 w-auto max-w-[40%] rounded-md border border-border/40 bg-white object-contain"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-[11px] font-medium text-[#122820]">
                {active.title || "未命名图"}
              </p>
              <p className="text-[10px] leading-snug text-muted-foreground">
                {formatFigurePlacementHint({
                  sectionKey: active.sectionKey,
                  insertMode: active.insertMode,
                  sectionLabel: sectionLabelOf?.(active.sectionKey),
                })}
              </p>
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 gap-1 px-2 text-[11px]"
                  disabled={disabled}
                  onClick={() =>
                    setRevisingId((id) => (id === active.id ? null : active.id))
                  }
                >
                  <Pencil className="h-3 w-3" />
                  按意见改
                </Button>
                {plotHref ? (
                  <Link
                    href={plotHref}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      if (active.figureSpecEnc) {
                        stashPlotPrefill({
                          figureSpecEnc: active.figureSpecEnc,
                          chartAssetId: active.chartAssetId,
                          imageUrl: active.imageUrl,
                          projectId,
                        });
                      }
                    }}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "h-7 gap-1 px-2 text-[11px]",
                    )}
                  >
                    <ExternalLink className="h-3 w-3" />
                    期刊精修
                  </Link>
                ) : null}
                {active.sectionKey && onJumpToSection ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => onJumpToSection(active.sectionKey!)}
                  >
                    查看正文
                  </Button>
                ) : null}
              </div>
            </div>
            {revisingId === active.id ? (
              <button
                type="button"
                className="self-start text-muted-foreground hover:text-foreground"
                onClick={() => setRevisingId(null)}
                aria-label="关闭表单"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          {revisingId === active.id ? (
            <FigureReviseForm
              target={active}
              disabled={disabled}
              onCancel={() => setRevisingId(null)}
              onSubmit={(form) => {
                onRevise(active, form);
                setRevisingId(null);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
