import type { ChartConfig, DataSourceAnalysis, EvidenceClaim } from "@/contracts/data-source";

export interface DataAnalyzeResult {
  analysis: DataSourceAnalysis;
  claims: EvidenceClaim[];
  chartConfigs: ChartConfig[];
}

async function parseAnalyzeResponse(res: Response): Promise<DataAnalyzeResult> {
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "数据分析失败");
  }
  return res.json() as Promise<DataAnalyzeResult>;
}

/** POST /api/data/analyze — multipart 文件上传 */
export async function analyzeDataFile(file: File): Promise<DataAnalyzeResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/data/analyze", { method: "POST", body: fd });
  return parseAnalyzeResponse(res);
}

/** POST /api/data/analyze — JSON 文本摘要 */
export async function analyzeDataText(data: string, fileName: string): Promise<DataAnalyzeResult> {
  const res = await fetch("/api/data/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, fileName }),
  });
  return parseAnalyzeResponse(res);
}
