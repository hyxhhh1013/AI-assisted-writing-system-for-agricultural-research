"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminAnimatedNumber } from "@/components/admin/admin-animated-number";

interface AdminStatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  href?: string;
  suffix?: string;
  footer?: ReactNode;
  /** 仅用于同页多卡片的轻微层次，不再使用彩虹色 */
  tone?: "primary" | "muted";
}

export function AdminStatCard({
  label,
  value,
  icon: Icon,
  href,
  suffix,
  footer,
  tone = "muted",
}: AdminStatCardProps) {
  const inner = (
    <div
      className={cn(
        "rounded-xl border bg-white p-4 transition-colors",
        tone === "primary"
          ? "border-[#1a5632]/20 shadow-sm"
          : "border-[#1a5632]/10 hover:border-[#1a5632]/18",
        href && "cursor-pointer hover:bg-[#faf9f6]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[#6b7c72]">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-[#122820]">
            <AdminAnimatedNumber value={value} durationMs={600} />
            {suffix && <span className="ml-1 text-sm font-normal text-[#9aa8a0]">{suffix}</span>}
          </p>
          {footer && <div className="mt-1.5 text-[11px] text-[#9aa8a0]">{footer}</div>}
        </div>
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            tone === "primary" ? "bg-[#1a5632] text-white" : "bg-[#1a5632]/8 text-[#1a5632]",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );

  if (href) return <Link href={href} className="block">{inner}</Link>;
  return inner;
}

export interface AdminMetricItem {
  label: string;
  value: number;
  icon: LucideIcon;
  href?: string;
  suffix?: string;
}

/** 单行指标条：避免 7 张渐变卡堆叠 */
export function AdminMetricStrip({ items }: { items: AdminMetricItem[] }) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-xl border border-[#1a5632]/12 bg-[#1a5632]/8",
        items.length > 4 ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-7" : "grid-cols-2 sm:grid-cols-4",
      )}
    >
      {items.map((item, i) => {
        const cell = (
          <div className="flex items-center gap-3 bg-white px-4 py-3.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1a5632]/8 text-[#1a5632]">
              <item.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] text-[#9aa8a0]">{item.label}</p>
              <p className="text-lg font-semibold tabular-nums text-[#122820]">
                <AdminAnimatedNumber value={item.value} durationMs={500} />
                {item.suffix && <span className="ml-0.5 text-xs font-normal text-[#9aa8a0]">{item.suffix}</span>}
              </p>
            </div>
          </div>
        );
        return item.href ? (
          <Link key={item.label} href={item.href} className="hover:bg-[#faf9f6] transition-colors">
            {cell}
          </Link>
        ) : (
          <div key={item.label}>{cell}</div>
        );
      })}
    </div>
  );
}
