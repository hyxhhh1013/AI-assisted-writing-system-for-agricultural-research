"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AdminPanelProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** 宽面板用于主图表，窄面板用于侧栏 */
  span?: "default" | "wide" | "full";
}

export function AdminPanel({
  title,
  subtitle,
  actions,
  children,
  className,
  span = "default",
}: AdminPanelProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[#1a5632]/10 bg-white",
        span === "wide" && "lg:col-span-2",
        span === "full" && "col-span-full",
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 border-b border-[#1a5632]/8 px-4 py-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-[#122820]">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-[11px] text-[#9aa8a0]">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

/** 数据太少时不撑大图表区 */
export function AdminCompactList({
  items,
  emptyText = "暂无数据",
}: {
  items: Array<{ label: string; value: number | string; hint?: string }>;
  emptyText?: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-xs text-[#9aa8a0]">{emptyText}</p>;
  }
  return (
    <ul className="divide-y divide-[#1a5632]/8">
      {items.map((item) => (
        <li key={item.label} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="truncate text-sm text-[#3d4f46]">{item.label}</p>
            {item.hint && <p className="text-[10px] text-[#9aa8a0]">{item.hint}</p>}
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-[#1a5632]">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}
