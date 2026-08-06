"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AdminRingMetricProps {
  label: string;
  value: number;
  max?: number;
  unit?: string;
  size?: number;
  stroke?: number;
  color?: string;
  status?: "ok" | "warn" | "error";
  className?: string;
}

const STATUS_COLOR = {
  ok: "#1a5632",
  warn: "#d97706",
  error: "#dc2626",
};

export function AdminRingMetric({
  label,
  value,
  max = 100,
  unit = "%",
  size = 96,
  stroke = 8,
  color,
  status = "ok",
  className,
}: AdminRingMetricProps) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const strokeColor = color ?? STATUS_COLOR[status];
  const centerMain = unit === "%" ? `${pct}%` : value.toLocaleString();
  const centerSub = unit !== "%" ? unit : undefined;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-[#1a5632]/10"
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c - dash }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold tabular-nums text-[#122820]">{centerMain}</span>
          {centerSub && <span className="text-[9px] text-[#9aa8a0]">{centerSub}</span>}
        </div>
      </div>
      <p className="text-center text-[11px] font-medium text-[#6b7c72]">{label}</p>
    </div>
  );
}
