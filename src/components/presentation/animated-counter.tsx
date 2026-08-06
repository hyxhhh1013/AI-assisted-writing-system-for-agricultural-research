"use client";

import { useState, useEffect } from "react";

export function AnimatedCounter({ target, duration = 1000, delay = 0, suffix = "" }: {
  target: number;
  duration?: number;
  delay?: number;
  suffix?: string;
}) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start - delay;
      if (elapsed < 0) return;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration, delay]);
  return <>{value}{suffix}</>;
}
