/**
 * 数据分析引擎 — 纯计算，不调 AI。
 * 支持 CSV / TSV / XLSX 输入，自动检测格式。
 * 输出 DataSourceAnalysis + EvidenceClaim[] + ChartConfig[]
 */

import type {
  ColumnInfo, VariableStats, GroupStat, ComparisonClaim,
  DataSourceAnalysis, EvidenceClaim, ChartConfig, ChartType,
} from "@/contracts/data-source";

// === 格式检测 ===

type FileFormat = "csv" | "tsv" | "xlsx";

function detectFormat(fileName: string, content?: string | Buffer | ArrayBuffer): FileFormat {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "tsv" || ext === "tab" || ext === "txt") return "tsv";
  if (typeof content === "string" && content.includes("\t") && !content.includes(",")) return "tsv";
  return "csv";
}

// === 分隔符文本解析（CSV / TSV 共用） ===

function parseDelimited(text: string, delimiter: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^﻿/, "").trim();
  const lines = clean.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1)
    .map(parseLine)
    .filter(r => r.length === headers.length && r.some(c => c));
  return { headers, rows };
}

// === XLSX 解析 ===

async function parseXlsx(buffer: ArrayBuffer): Promise<{ headers: string[]; rows: string[][] }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const sheet = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "", blankrows: false });

  if (data.length < 2) return { headers: [], rows: [] };

  // 第一行是表头，跳过完全空白的列
  const headers = (data[0] as string[]).map(h => String(h ?? "").trim()).filter(h => h !== "");

  // 数据行：过滤全空行，填充缺失列
  const rows = data.slice(1)
    .map(row => {
      const arr = row as string[];
      return headers.map((_, i) => String(arr[i] ?? "").trim());
    })
    .filter(r => r.some(c => c));

  return { headers, rows };
}

// === 统一入口 ===

export interface ParseResult {
  headers: string[];
  rows: string[][];
  format: FileFormat;
}

/**
 * 自动检测格式并解析文件。
 * @param input - 文件内容：CSV/TSV 传字符串，XLSX 传 ArrayBuffer
 * @param fileName - 文件名（用于检测扩展名）
 */
export async function detectAndParse(input: string | ArrayBuffer, fileName: string): Promise<ParseResult> {
  const format = detectFormat(fileName, typeof input === "string" ? input : undefined);

  let headers: string[] = [];
  let rows: string[][] = [];

  if (format === "xlsx") {
    ({ headers, rows } = await parseXlsx(input as ArrayBuffer));
  } else {
    const delimiter = format === "tsv" ? "\t" : ",";
    ({ headers, rows } = parseDelimited(input as string, delimiter));
  }

  return { headers, rows, format };
}

// === 列类型检测 ===

function detectColumnType(values: string[]): ColumnInfo["type"] {
  const nonEmpty = values.filter(v => v !== "" && v != null);
  if (nonEmpty.length === 0) return "text";

  const numericCount = nonEmpty.filter(v => !isNaN(Number(v)) && v.trim() !== "").length;
  if (numericCount / nonEmpty.length >= 0.7) return "numeric";

  // 分组列：少数唯一值 + 短标签
  const unique = new Set(nonEmpty);
  const maxLabelLen = Math.max(...Array.from(unique).map(s => s.length));
  const avgLabelLen = Array.from(unique).reduce((a, b) => a + b.length, 0) / unique.size;
  if (unique.size <= nonEmpty.length / 2 + 1 && maxLabelLen < 30 && avgLabelLen < 15) return "group";
  if (unique.size <= 10 && maxLabelLen < 20) return "group";

  return "text";
}

// === 统计计算 ===

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function std(values: number[], m: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
}

// Welch t-test 近似 p 值（简化版，用于显著性判断）
function approxTTest(a: number[], b: number[]): { t: number; pValue: number; significant: boolean } {
  const ma = mean(a), mb = mean(b);
  const sa = std(a, ma), sb = std(b, mb);
  const na = a.length, nb = b.length;
  const se = Math.sqrt(sa * sa / na + sb * sb / nb);
  if (se === 0) return { t: 0, pValue: 1, significant: false };
  const t = Math.abs(ma - mb) / se;
  // 简化 p 值映射（t > 2 ≈ p < 0.05, t > 2.6 ≈ p < 0.01）
  const pValue = t > 2.6 ? 0.005 : t > 2 ? 0.03 : t > 1.6 ? 0.1 : 0.3;
  return { t, pValue, significant: pValue < 0.05 };
}

// === 趋势检测 ===

function detectTrend(values: number[]): VariableStats["trend"] {
  if (values.length < 3) return "no_trend";
  let up = 0, down = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) up++;
    else if (values[i] < values[i - 1]) down++;
  }
  const total = up + down;
  if (total === 0) return "no_trend";
  if (up / total >= 0.7) return "increasing";
  if (down / total >= 0.7) return "decreasing";
  if (up > 0 && down > 0) return "non_monotonic";
  return "no_trend";
}

// === 相关性 ===

function correlation(x: number[], y: number[]): number {
  const mx = mean(x), my = mean(y);
  const n = Math.min(x.length, y.length);
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    denX += (x[i] - mx) ** 2;
    denY += (y[i] - my) ** 2;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

// === 主分析函数 ===

/**
 * 主入口：自动检测格式，解析并分析。
 * @param input - CSV/TSV 传 string，XLSX 传 ArrayBuffer
 */
export async function analyzeFile(input: string | ArrayBuffer, fileName: string): Promise<{
  analysis: DataSourceAnalysis;
  claims: EvidenceClaim[];
  chartConfigs: ChartConfig[];
}> {
  const { headers, rows } = await detectAndParse(input, fileName);
  return analyzeData(headers, rows, fileName);
}

/**
 * 用已解析的数据进行分析（供需要自定义解析逻辑的场景）。
 */
export function analyzeData(headers: string[], rows: string[][], fileName: string): {
  analysis: DataSourceAnalysis;
  claims: EvidenceClaim[];
  chartConfigs: ChartConfig[];
} {
  if (headers.length === 0 || rows.length === 0) {
    return { analysis: { fileName, rowCount: 0, columns: [], stats: [], generatedAt: Date.now() }, claims: [], chartConfigs: [] };
  }

  const sourceId = makeSourceId(fileName);

  const rowCount = rows.length;

  // 列检测
  const columns: ColumnInfo[] = headers.map((name, i) => {
    const values = rows.map(r => r[i] || "");
    const type = detectColumnType(values);
    return { name, type, count: values.filter(v => v !== "").length, uniqueValues: type === "group" ? new Set(values).size : undefined };
  });

  const groupCol = columns.find(c => c.type === "group");
  const numericCols = columns.filter(c => c.type === "numeric");

  // 每个数值列的统计
  const stats: VariableStats[] = [];
  const claims: EvidenceClaim[] = [];
  const chartConfigs: ChartConfig[] = [];
  let claimIdx = 0;

  for (const numCol of numericCols) {
    const values = rows.map(r => Number(r[headers.indexOf(numCol.name)])).filter(v => !isNaN(v));
    if (values.length === 0) continue;

    const m = mean(values);
    const s = std(values, m);
    const vmin = Math.min(...values);
    const vmax = Math.max(...values);

    const stat: VariableStats = {
      variable: numCol.name,
      mean: round(m),
      sd: round(s),
      min: round(vmin),
      max: round(vmax),
      trend: detectTrend(values),
    };

    // 如果有分组列，计算分组统计
    if (groupCol) {
      const groupIdx = headers.indexOf(groupCol.name);
      const groups = new Map<string, number[]>();
      for (let i = 0; i < rows.length; i++) {
        const g = rows[i][groupIdx] || "未标注";
        const v = Number(rows[i][headers.indexOf(numCol.name)]);
        if (!isNaN(v)) {
          if (!groups.has(g)) groups.set(g, []);
          groups.get(g)!.push(v);
        }
      }

      const groupNames = Array.from(groups.keys());
      const groupStats: GroupStat[] = groupNames.map(g => {
        const vals = groups.get(g)!;
        return { label: g, mean: round(mean(vals)), sd: round(std(vals, mean(vals))), n: vals.length };
      });
      stat.groups = groupStats;

      // 生成 comparison claims（组间对比）
      const comparisons: ComparisonClaim[] = [];
      for (let i = 0; i < groupStats.length; i++) {
        for (let j = i + 1; j < groupStats.length; j++) {
          const a = groups.get(groupStats[i].label)!;
          const b = groups.get(groupStats[j].label)!;
          const { pValue, significant } = approxTTest(a, b);
          const changePct = round((groupStats[j].mean - groupStats[i].mean) / Math.abs(groupStats[i].mean || 1) * 100);
          comparisons.push({ groupA: groupStats[i].label, groupB: groupStats[j].label, changePct, pValue: round(pValue), significant });
        }
      }
      stat.comparisons = comparisons;

      // 生成 EvidenceClaim
      for (const comp of comparisons) {
        claimIdx++;
        const pv = comp.pValue ?? 1;
        const suf = comp.significant ? `，差异显著(P<${round(pv)})` : `，差异不显著`;
        const dir = comp.changePct >= 0 ? "提高" : "降低";
        claims.push({
          id: `${sourceId}-C${claimIdx}`,
          sourceId: sourceId,
          sourceType: "data",
          type: "comparison",
          text: `${comp.groupB}较${comp.groupA}${stat.variable}${dir}${Math.abs(comp.changePct)}%${suf}`,
          values: {
            groupA: comp.groupA, groupB: comp.groupB,
            changePct: comp.changePct,
            pValue: round(pv).toString(),
            significant: comp.significant ? "true" : "false",
          },
          variables: [stat.variable],
          pValue: round(pv),
          tolerance: 5,
        });
      }

      // Mean claim
      claimIdx++;
      claims.push({
        id: `D1-C${claimIdx}`,
        sourceId: "D1",
        sourceType: "data",
        type: "mean",
        text: `各组${stat.variable}平均为${round(m)}${s > 0 ? `±${round(s)}` : ""}`,
        values: { mean: round(m), sd: round(s), min: round(vmin), max: round(vmax) },
        variables: [stat.variable],
        tolerance: 5,
      });

      // Trend claim
      if (stat.trend && stat.trend !== "no_trend" && stat.trend !== "non_monotonic") {
        claimIdx++;
        const trendText = stat.trend === "increasing" ? "持续上升" : "持续下降";
        claims.push({
          id: `${sourceId}-C${claimIdx}`,
          sourceId: sourceId,
          sourceType: "data",
          type: "trend",
          text: `随着处理顺序，${stat.variable}呈${trendText}趋势`,
          values: { trend: stat.trend, values: values.map(v => round(v)).join(",") },
          variables: [stat.variable],
          tolerance: 10,
        });
      }

      // 图表配置
      if (groupStats.length >= 2) {
        const chartType: ChartType = groupStats.length <= 6 ? "bar" : "grouped_bar";
        chartConfigs.push({
          type: chartType,
          title: `各处理${stat.variable}对比`,
          xLabel: groupCol.name,
          yLabel: stat.variable,
          labels: groupStats.map(g => g.label),
          datasets: [{ label: stat.variable, data: groupStats.map(g => round(g.mean)) }],
        });
      }
    } else {
      // 无分组列：生成趋势图
      if (values.length >= 3) {
        chartConfigs.push({
          type: "line",
          title: `${stat.variable}变化趋势`,
          xLabel: "序号",
          yLabel: stat.variable,
          labels: values.map((_, i) => `${i + 1}`),
          datasets: [{ label: stat.variable, data: values.map(v => round(v)) }],
        });
      }
    }

    stats.push(stat);
  }

  // 数值列之间的相关性
  for (let i = 0; i < numericCols.length; i++) {
    for (let j = i + 1; j < numericCols.length; j++) {
      const xi = rows.map(r => Number(r[headers.indexOf(numericCols[i].name)])).filter(v => !isNaN(v));
      const xj = rows.map(r => Number(r[headers.indexOf(numericCols[j].name)])).filter(v => !isNaN(v));
      const n = Math.min(xi.length, xj.length);
      const r = correlation(xi.slice(0, n), xj.slice(0, n));
      if (Math.abs(r) >= 0.5) {
        claimIdx++;
        const dir = r >= 0 ? "正相关" : "负相关";
        claims.push({
          id: `${sourceId}-C${claimIdx}`,
          sourceId: sourceId,
          sourceType: "data",
          type: "correlation",
          text: `${numericCols[i].name}与${numericCols[j].name}呈${dir}(r=${round(r)})`,
          values: { var1: numericCols[i].name, var2: numericCols[j].name, r: round(r) },
          variables: [numericCols[i].name, numericCols[j].name],
          tolerance: 10,
        });
      }
    }
  }

  return {
    analysis: { fileName, rowCount, columns, stats, generatedAt: Date.now(), chartConfigs },
    claims,
    chartConfigs,
  };
}

function round(n: number, decimals = 2): number {
  return Math.round(n * 10 ** decimals) / 10 ** decimals;
}

function makeSourceId(fileName: string): string {
  return `D-${fileName.replace(/[^a-zA-Z0-9一-鿿]/g, "_").replace(/_+/g, "_").replace(/\.\w+$/, "")}`;
}
