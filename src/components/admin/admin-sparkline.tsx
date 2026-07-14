"use client";

interface AdminSparklineProps {
  points: number[];
  height?: number;
  width?: number;
  color?: string;
  className?: string;
}

/** 内联迷你趋势，适合稀疏数据，不占大面板 */
export function AdminSparkline({
  points,
  height = 40,
  width = 120,
  color = "#1a5632",
  className,
}: AdminSparklineProps) {
  if (points.length === 0) return null;

  const max = Math.max(...points, 1);
  const pad = 2;
  const step = (width - pad * 2) / Math.max(points.length - 1, 1);

  const coords = points.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (height - pad * 2) - (v / max) * (height - pad * 2);
    return `${x},${y}`;
  });

  return (
    <svg
      width={width}
      height={height}
      className={className}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords.join(" ")}
      />
      {points.map((v, i) => {
        if (v === 0) return null;
        const x = pad + i * step;
        const y = pad + (height - pad * 2) - (v / max) * (height - pad * 2);
        return <circle key={i} cx={x} cy={y} r="2.5" fill={color} />;
      })}
    </svg>
  );
}

export function isSparseTrend(points: Array<{ value: number }>): boolean {
  const nonZero = points.filter((p) => p.value > 0).length;
  const total = points.reduce((s, p) => s + p.value, 0);
  return nonZero <= 2 || total <= 8;
}
