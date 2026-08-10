"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface AdminChartPoint {
  label: string;
  value: number;
}

interface AdminBarChartProps {
  points: AdminChartPoint[];
  height?: number;
  className?: string;
  variant?: "bar" | "area";
  color?: string;
  emptyText?: string;
}

export function AdminBarChart({
  points,
  height = 140,
  className,
  variant = "bar",
  color = "#1a5632",
  emptyText = "暂无数据",
}: AdminBarChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = useMemo(() => Math.max(...points.map((p) => p.value), 1), [points]);
  const padX = 8;
  const padY = 24;
  const width = Math.max(points.length * 28, 200);
  const chartH = height - padY;

  if (points.length === 0) {
    return <p className="py-10 text-center text-xs text-[#9aa8a0]">{emptyText}</p>;
  }

  const barW = Math.min(32, (width - padX * 2) / points.length - 4);

  const areaPath = (() => {
    const step = (width - padX * 2) / Math.max(points.length - 1, 1);
    const coords = points.map((p, i) => {
      const x = padX + i * step;
      const y = padY + chartH - (p.value / max) * chartH;
      return `${x},${y}`;
    });
    const base = padY + chartH;
    return `M ${padX},${base} L ${coords.join(" L ")} L ${padX + (points.length - 1) * step},${base} Z`;
  })();

  return (
    <div className={cn("relative w-full", className)}>
      {hovered !== null && points[hovered] && (
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-md border border-[#1a5632]/12 bg-white px-2.5 py-1 text-center shadow-sm">
          <p className="text-[10px] text-[#9aa8a0]">{points[hovered].label}</p>
          <p className="text-sm font-semibold tabular-nums text-[#122820]">{points[hovered].value}</p>
        </div>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="xMidYMax meet"
        role="img"
        aria-label="趋势图"
      >
        <defs>
          <linearGradient id="adminBarGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.85" />
            <stop offset="100%" stopColor={color} stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="adminAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {variant === "area" && <path fill="url(#adminAreaGrad)" d={areaPath} />}

        {points.map((p, i) => {
          const active = hovered === i;
          // 点多时稀疏打标，避免 X 轴叠字
          const labelStep = points.length > 14 ? 5 : points.length > 8 ? 2 : 1;
          const showLabel = i % labelStep === 0 || i === points.length - 1;

          if (variant === "area") {
            const step = (width - padX * 2) / Math.max(points.length - 1, 1);
            const cx = padX + i * step;
            const cy = padY + chartH - (p.value / max) * chartH;
            return (
              <g key={`${p.label}-${i}`}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={active ? 5 : 3.5}
                  fill={color}
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                />
                {showLabel && (
                  <text x={cx} y={height - 4} textAnchor="middle" className="fill-[#9aa8a0] text-[8px]">
                    {p.label}
                  </text>
                )}
              </g>
            );
          }

          const x = padX + i * ((width - padX * 2) / points.length) + 2;
          const h = Math.max((p.value / max) * chartH, 4);
          const y = padY + chartH - h;

          return (
            <g key={`${p.label}-${i}`}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={3}
                fill="url(#adminBarGrad)"
                opacity={active ? 1 : 0.88}
                className="cursor-pointer"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
              {showLabel && (
                <text x={x + barW / 2} y={height - 4} textAnchor="middle" className="fill-[#9aa8a0] text-[8px]">
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

interface AdminHBarProps {
  items: Array<{ label: string; value: number; color?: string }>;
  maxItems?: number;
}

export function AdminHBarChart({ items, maxItems = 8 }: AdminHBarProps) {
  const slice = items.slice(0, maxItems);
  const max = Math.max(...slice.map((i) => i.value), 1);

  return (
    <div className="space-y-2">
      {slice.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-[#3d4f46]">{item.label}</span>
            <span className="shrink-0 tabular-nums text-[#9aa8a0]">{item.value}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#1a5632]/8">
            <div
              className="h-full rounded-full bg-[#1a5632] transition-all duration-500"
              style={{
                width: `${Math.max((item.value / max) * 100, item.value > 0 ? 8 : 0)}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
