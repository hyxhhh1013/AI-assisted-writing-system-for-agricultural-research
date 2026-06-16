export interface PresentationStats {
  knowledgeCount: number;
  categoryCount: number;
  categories: string[];
  chunkCount: number;
  chartCount: number;
}

interface PresentationStatsResponse {
  success?: boolean;
  data?: Partial<PresentationStats>;
}

export const defaultPresentationStats: PresentationStats = {
  knowledgeCount: 1383,
  categoryCount: 10,
  categories: [],
  chunkCount: 50000,
  chartCount: 14,
};

export async function getPresentationStats(): Promise<PresentationStats> {
  const res = await fetch("/api/presentation/stats");
  const payload = (await res.json()) as PresentationStatsResponse;
  if (!res.ok || !payload.success || !payload.data) {
    throw new Error("Failed to load presentation stats");
  }
  return { ...defaultPresentationStats, ...payload.data };
}
