import type { JournalMetrics } from "@/contracts/knowledge";
import { formatIssnForOpenAlex } from "@/lib/journal-metrics";

interface OpenAlexSource {
  summary_stats?: {
    "2yr_mean_citedness"?: number;
    h_index?: number;
  };
}

interface OpenAlexSourcesResponse {
  results?: OpenAlexSource[];
}

/** 按 ISSN 查 OpenAlex 期刊级统计（非 JCR IF） */
export async function fetchOpenAlexSourceMetrics(
  issn: string,
  mailto?: string,
): Promise<Pick<JournalMetrics, "oa2yrCitedness" | "hIndex"> | null> {
  const formatted = formatIssnForOpenAlex(issn);
  if (!formatted) return null;

  const url = new URL("https://api.openalex.org/sources");
  url.searchParams.set("filter", `issn:${formatted}`);
  if (mailto?.trim()) url.searchParams.set("mailto", mailto.trim());

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as OpenAlexSourcesResponse;
  const source = data.results?.[0];
  if (!source?.summary_stats) return null;

  const oa2yr = source.summary_stats["2yr_mean_citedness"];
  const hIndex = source.summary_stats.h_index;
  if (oa2yr == null && hIndex == null) return null;

  return {
    oa2yrCitedness: typeof oa2yr === "number" ? oa2yr : undefined,
    hIndex: typeof hIndex === "number" ? hIndex : undefined,
  };
}
