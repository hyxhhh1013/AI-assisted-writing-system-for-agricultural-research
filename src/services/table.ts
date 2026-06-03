/** POST /api/table — GB/T 7714 三线表 */

export interface TableGroupInput {
  label: string;
  n: number;
  mean: number;
  sd: number;
}

export interface TableGenerateRequest {
  title: string;
  columnHeader?: string;
  groups: TableGroupInput[];
  anova?: { F: number; df1: number; df2: number; p: number };
  posthoc?: Array<{ pair: [string, string]; p: number }>;
  alpha?: number;
  note?: string;
}

export interface TableGenerateResult {
  latex: string;
  html: string;
  statsText: string;
  letters: Record<string, string>;
}

export async function generateTable(body: TableGenerateRequest): Promise<TableGenerateResult> {
  const res = await fetch("/api/table", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as TableGenerateResult & { error?: string };
  if (!res.ok) throw new Error(data.error || "生成失败");
  return data;
}
