"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { ExternalLiteratureHit } from "@/contracts/literature";
import {
  IMPORT_SOURCE_LABELS,
  literatureLandingUrl,
} from "@/lib/agent/import-confirm-view";
import { cn } from "@/lib/utils";

export function ImportConfirmList({
  items,
  selected,
  onToggle,
  onSetAll,
}: {
  items: ExternalLiteratureHit[];
  selected: Set<number> | null;
  onToggle: (idx: number, checked: boolean) => void;
  onSetAll: (checked: boolean) => void;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const selectedCount = selected?.size ?? 0;

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] text-[#3d4f46]/80">
          已收集 {items.length} 篇，已选 {selectedCount} 篇 · 点开可看摘要
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="text-[10px] text-[#1a5632] hover:underline"
            onClick={() => onSetAll(true)}
          >
            全选
          </button>
          <button
            type="button"
            className="text-[10px] text-[#3d4f46]/70 hover:underline"
            onClick={() => onSetAll(false)}
          >
            全不选
          </button>
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto rounded-md border border-border/50 bg-white/90">
        {items.map((item, i) => {
          const checked = selected?.has(i) ?? false;
          const open = openIdx === i;
          return (
            <ImportConfirmRow
              key={`${item.id}:${i}`}
              item={item}
              checked={checked}
              open={open}
              onToggleChecked={(v) => onToggle(i, v)}
              onToggleOpen={() => setOpenIdx(open ? null : i)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ImportConfirmRow({
  item,
  checked,
  open,
  onToggleChecked,
  onToggleOpen,
}: {
  item: ExternalLiteratureHit;
  checked: boolean;
  open: boolean;
  onToggleChecked: (checked: boolean) => void;
  onToggleOpen: () => void;
}) {
  const authors =
    item.authors.length > 0
      ? `${item.authors.slice(0, 4).join(", ")}${item.authors.length > 4 ? " 等" : ""}`
      : "";
  const landing = literatureLandingUrl(item);
  const doiHref = item.doi
    ? `https://doi.org/${item.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`
    : null;

  return (
    <div className="border-b border-border/40 last:border-0">
      <div className="flex items-start gap-2 px-2 py-1.5">
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onToggleChecked(v === true)}
          className="mt-0.5"
          aria-label={`选择 ${item.title || "文献"}`}
        />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onToggleOpen}
          aria-expanded={open}
        >
          <p className="text-[11px] leading-snug break-words text-[#122820]">
            {item.title || "(无标题)"}
          </p>
          <p className="truncate text-[9px] text-[#6b7c72]">
            {[item.year, item.journal, item.doi].filter(Boolean).join(" · ")}
          </p>
          {(item.citedByCount != null || item.source || item.isOpenAccess) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {item.citedByCount != null && (
                <span className="rounded bg-muted px-1 py-px text-[8px] leading-none text-muted-foreground">
                  被引 {item.citedByCount}
                </span>
              )}
              {item.source && IMPORT_SOURCE_LABELS[item.source] && (
                <span className="rounded bg-[#6366f1]/10 px-1 py-px text-[8px] leading-none text-[#6366f1]">
                  {IMPORT_SOURCE_LABELS[item.source]}
                </span>
              )}
              {item.isOpenAccess && (
                <span className="rounded bg-emerald-600/10 px-1 py-px text-[8px] leading-none text-emerald-700">
                  OA
                </span>
              )}
            </div>
          )}
          <span className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] text-[#1a5632]">
            {open ? "收起" : item.abstract?.trim() ? "查看摘要" : "查看详情"}
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
          </span>
        </button>
      </div>
      {open ? (
        <div className="space-y-1.5 border-t border-border/30 bg-[#f6f8f6]/80 px-2 py-2 pl-8">
          {authors ? (
            <p className="text-[10px] leading-relaxed text-[#3d4f46]">{authors}</p>
          ) : null}
          {item.abstract?.trim() ? (
            <p className="max-h-32 overflow-y-auto text-[10px] leading-relaxed text-[#122820]/90">
              {item.abstract.trim()}
            </p>
          ) : (
            <p className="text-[10px] text-[#6b7c72]">
              检索结果未带摘要，可打开原文判断是否相关。
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {landing ? (
              <a
                href={landing}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-[10px] text-[#1a5632] hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {item.openAccessUrl ? "打开 OA 全文" : "打开原文"}
              </a>
            ) : null}
            {doiHref && landing !== doiHref ? (
              <a
                href={doiHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-[10px] text-[#1a5632] hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                DOI
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
