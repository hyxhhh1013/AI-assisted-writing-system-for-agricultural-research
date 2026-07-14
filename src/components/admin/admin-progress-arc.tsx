"use client";

import { cn } from "@/lib/utils";

interface AdminProgressArcProps {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  showLabel?: boolean;
  className?: string;
}

/** 表格内迷你环形进度 */
export function AdminProgressArc({
  value,
  size = 36,
  stroke = 4,
  color = "#1a5632",
  showLabel = true,
  className,
}: AdminProgressArcProps) {
  const pct = Math.min(100, Math.max(0, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <svg width={size} height={size} className="-rotate-90 shrink-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1a5632" strokeOpacity={0.12} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - dash}
        />
      </svg>
      {showLabel && <span className="text-xs tabular-nums text-[#6b7c72]">{pct}%</span>}
    </div>
  );
}
