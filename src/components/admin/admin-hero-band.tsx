"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AdminAnimatedNumber } from "@/components/admin/admin-animated-number";

export interface AdminHeroMetric {
  label: string;
  value: number;
  icon: LucideIcon;
  href?: string;
  suffix?: string;
}

interface AdminHeroBandProps {
  metrics: AdminHeroMetric[];
  aiLine?: string;
}

export function AdminHeroBand({ metrics, aiLine }: AdminHeroBandProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#1a5632]/20 bg-gradient-to-br from-[#1a5632] via-[#1d5c36] to-[#143d28] text-white shadow-sm">
      <div className="grid grid-cols-2 divide-x divide-white/10 sm:grid-cols-4">
        {metrics.map((m) => {
          const inner = (
            <div className="px-5 py-5 transition-colors hover:bg-white/5">
              <div className="flex items-center gap-2 text-white/70">
                <m.icon className="h-4 w-4" />
                <span className="text-xs">{m.label}</span>
              </div>
              <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
                <AdminAnimatedNumber value={m.value} durationMs={700} />
                {m.suffix && <span className="ml-1 text-base font-normal text-white/60">{m.suffix}</span>}
              </p>
            </div>
          );
          return m.href ? (
            <Link key={m.label} href={m.href} className="block">
              {inner}
            </Link>
          ) : (
            <div key={m.label}>{inner}</div>
          );
        })}
      </div>
      {aiLine && (
        <div className="border-t border-white/10 px-5 py-3 text-xs text-white/75">
          {aiLine}
        </div>
      )}
    </div>
  );
}
