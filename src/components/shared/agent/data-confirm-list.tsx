"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { DataConfirmItem } from "@/lib/agent/data-confirm-view";
import { cn } from "@/lib/utils";

export function DataConfirmList({
  items,
  selected,
  onToggle,
  onSetAll,
  className,
  listClassName,
}: {
  items: DataConfirmItem[];
  selected: Set<number> | null;
  onToggle: (idx: number, checked: boolean) => void;
  onSetAll: (checked: boolean) => void;
  className?: string;
  listClassName?: string;
}) {
  const selectedCount = selected?.size ?? 0;
  return (
    <div className={cn(className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-[#3d4f46]/80">
          共 {items.length} 项，已选 {selectedCount} 项。取消勾选的不会写入。
        </span>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="text-[11px] text-[#1a5632]" onClick={() => onSetAll(true)}>
            全选
          </button>
          <button type="button" className="text-[11px] text-[#1a5632]" onClick={() => onSetAll(false)}>
            全不选
          </button>
        </div>
      </div>
      <ul className={cn("space-y-2 overflow-y-auto", listClassName)}>
        {items.map((item, idx) => {
          const checked = selected?.has(idx) ?? false;
          const headers = (item.headers ?? []).filter(Boolean).slice(0, 6).join(" · ");
          return (
            <li key={`${item.kind}-${item.fileName}-${idx}`} className="rounded-lg border border-[#1a5632]/12 p-2">
              <label className="flex cursor-pointer items-start gap-2">
                <Checkbox
                  className="mt-0.5"
                  checked={checked}
                  onCheckedChange={(value) => onToggle(idx, value === true)}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-[#1a5632]/10 px-1.5 py-0.5 text-[10px] text-[#1a5632]">
                      {item.kind === "figure" ? "已有图" : "数据表"}
                    </span>
                    <span className="text-[13px] font-medium text-[#122820]">{item.label}</span>
                  </span>
                  <span className="mt-1 block text-[11px] leading-5 text-[#5a7a68]">
                    {item.fileName}
                    {item.sheetName ? ` · ${item.sheetName}` : ""}
                    {item.kind === "table" && item.rowCount != null ? ` · ${item.rowCount} 行` : ""}
                    {item.kind === "figure" && (item.readings?.length ?? 0) > 0
                      ? ` · 读出 ${item.readings?.length} 个数值，核对后才会用于写作`
                      : ""}
                    {item.kind === "figure" && (item.readings?.length ?? 0) === 0
                      ? " · 没读出数值，勾选后只登记图片"
                      : ""}
                  </span>
                  {item.readings && item.readings.length > 0 ? (
                    <span className="mt-1 block whitespace-pre-wrap text-[11px] leading-5 text-[#122820]">
                      {item.readings.map((reading) => (
                        `${reading.series}：${reading.y}${reading.unit ? ` ${reading.unit}` : ""}${reading.x ? `（${reading.x}）` : ""}`
                      )).join("\n")}
                    </span>
                  ) : null}
                  {item.readingNote ? (
                    <span className="mt-0.5 block text-[11px] text-[#8a5a20]">{item.readingNote}</span>
                  ) : null}
                  {headers ? (
                    <span className="mt-0.5 block truncate text-[11px] text-[#3d4f46]">列：{headers}</span>
                  ) : null}
                  {item.preview && item.preview.length > 0 ? (
                    <span className="mt-1 block whitespace-pre-wrap font-mono text-[10px] leading-4 text-[#3d4f46]/90">
                      {item.preview.map((row) => row.join(" | ")).join("\n")}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
