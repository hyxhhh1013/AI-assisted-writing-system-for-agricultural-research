"use client";

import { useEffect, useRef, useState } from "react";

interface AdminAnimatedNumberProps {
  value: number;
  className?: string;
  durationMs?: number;
}

export function AdminAnimatedNumber({ value, className, durationMs = 900 }: AdminAnimatedNumberProps) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    const start = performance.now();

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - p) ** 3;
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [value, durationMs]);

  return <span className={className}>{display.toLocaleString()}</span>;
}
