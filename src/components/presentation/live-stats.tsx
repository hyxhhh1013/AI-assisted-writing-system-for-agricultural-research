"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { defaultPresentationStats, getPresentationStats } from "@/services/presentation";

const StatsContext = createContext(defaultPresentationStats);

export function PresentationStatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState(defaultPresentationStats);

  useEffect(() => {
    getPresentationStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  return <StatsContext.Provider value={stats}>{children}</StatsContext.Provider>;
}

export function usePresentationStats() {
  return useContext(StatsContext);
}
