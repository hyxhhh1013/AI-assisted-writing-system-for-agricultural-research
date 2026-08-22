import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ChartExportManifest } from "@/contracts/chart-export";
import type { ChartQaReport } from "@/contracts/chart-qa";
import { liftStyleValidation, parseChartQaReport } from "@/contracts/chart-qa";
import type { ChartSpecV1 } from "@/contracts/chart-spec";
import { parseChartSpec } from "@/contracts/chart-spec";
import { persistChartExportSidecars } from "@/lib/chart-export-persist";
import { attachCompiledSpec, chartSpecToPlotConfig } from "@/lib/chart-spec-compiler";
import type { ChartSpecPatch } from "@/lib/chart-spec-patches";
import { applyChartSpecPatches } from "@/lib/chart-spec-patches";
import { getErrorMessage } from "@/lib/error-utils";
import { PYTHON_CMD, formatPythonSpawnError } from "@/lib/python-cmd";
import { ensureChartsDir } from "@/lib/charts-dir";

/** 首次渲染之外最多再渲 2 次 */
const MAX_PATCH_RENDERS = 2;

export type ChartRunMode = "generic" | "crd";

export interface RunChartGenerationInput {
  dataBuffer: Buffer;
  dataFileName?: string;
  config: Record<string, unknown>;
  mode?: ChartRunMode;
}

export interface ChartStyleValidationCheck {
  level: "pass" | "warn" | "fail" | string;
  code: string;
  message: string;
}

export interface ChartStyleValidation {
  ok: boolean;
  preset?: string;
  columns?: number;
  target_width_in?: number;
  checks: ChartStyleValidationCheck[];
}

export interface RunChartGenerationResult {
  imageUrl: string;
  svgUrl?: string;
  pdfUrl?: string;
  fileName: string;
  baseName: string;
  styleValidation?: ChartStyleValidation;
  qaReport?: ChartQaReport;
  chartSpec?: ChartSpecV1;
  specPatches?: ChartSpecPatch[];
  renderCount?: number;
  figWidth?: number;
  columns?: number;
  preset?: string;
  csvUrl?: string;
  exportManifest?: ChartExportManifest;
}

const SCRIPTS_DIR = path.join(process.cwd(), "scripts", "charts");

function resolveDataExt(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx")) return ".xlsx";
  if (lower.endsWith(".xls")) return ".xls";
  if (lower.endsWith(".csv")) return ".csv";
  if (lower.endsWith(".tsv")) return ".tsv";
  if (lower.endsWith(".txt")) return ".txt";
  return ".csv";
}

/** 服务端生成 matplotlib 图表（与 POST /api/chart 同源） */
export async function runChartGeneration(
  input: RunChartGenerationInput,
): Promise<RunChartGenerationResult> {
  const CHARTS_DIR = ensureChartsDir();

  const mode = input.mode ?? "generic";
  const tmpDir = path.join(process.cwd(), ".tmp", randomUUID());
  fs.mkdirSync(tmpDir, { recursive: true });

  const ext = resolveDataExt(input.dataFileName ?? "data.csv");
  const dataPath = path.join(tmpDir, `data${ext}`);
  fs.writeFileSync(dataPath, input.dataBuffer);

  const configPath = path.join(tmpDir, "config.json");
  const csvText = ext === ".xlsx" || ext === ".xls" ? "" : input.dataBuffer.toString("utf-8");
  const attached = mode === "generic"
    ? attachCompiledSpec(input.config, csvText)
    : { config: input.config, findings: [] };
  let config = attached.config;

  const outputName = `${randomUUID()}.png`;
  const outputPath = path.join(CHARTS_DIR, outputName);
  const scriptName = mode === "crd" ? "plot_crd.py" : "plot_generic.py";
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const specPatches: ChartSpecPatch[] = [];
  let renderCount = 0;

  try {
    let lastMeta: Record<string, unknown> = {};
    for (let attempt = 0; attempt <= MAX_PATCH_RENDERS; attempt++) {
      fs.writeFileSync(configPath, JSON.stringify(config), "utf-8");
      const result = await spawnChartPython({
        scriptPath,
        dataPath,
        configPath,
        outputPath,
      });
      renderCount += 1;
      if (!result.success) {
        throw new Error(result.error ?? "图表生成失败");
      }
      if (!fs.existsSync(outputPath)) {
        throw new Error("图表生成失败: 输出文件未创建");
      }
      lastMeta = result.meta ?? {};

      if (mode !== "generic" || attempt >= MAX_PATCH_RENDERS) break;
      const qa = parseQaFromMeta(lastMeta);
      if (!qa || qa.verdict === "pass") break;
      const spec = parseChartSpec(config.chartSpec);
      if (!spec) break;
      const applied = applyChartSpecPatches(spec, qa.findings);
      if (applied.patches.length === 0) break;
      specPatches.push(...applied.patches);
      const fromSpec = chartSpecToPlotConfig(applied.spec);
      config = {
        ...config,
        ...fromSpec,
        chartSpec: applied.spec,
        // 旧 L0 已写入 spec，避免修补后仍带着过期 missing_unit
        chartSpecL0: { verdict: "pass", findings: [] },
      };
    }

    const baseName = outputName.replace(/\.png$/i, "");
    const svgName = `${baseName}.svg`;
    const pdfName = `${baseName}.pdf`;
    const svgPath = path.join(CHARTS_DIR, svgName);
    const pdfPath = path.join(CHARTS_DIR, pdfName);

    const styleValidation =
      lastMeta.styleValidation && typeof lastMeta.styleValidation === "object"
        ? (lastMeta.styleValidation as ChartStyleValidation)
        : undefined;
    const qaReport = parseQaFromMeta(lastMeta);
    const chartSpec = parseChartSpec(config.chartSpec) ?? undefined;
    const figWidth = typeof lastMeta.fig_width === "number" ? lastMeta.fig_width : undefined;
    const columns = typeof lastMeta.columns === "number" ? lastMeta.columns : undefined;
    const preset = typeof lastMeta.preset === "string" ? lastMeta.preset : undefined;
    const exportManifest = persistChartExportSidecars({
      baseName,
      csvText,
      spec: chartSpec,
      qa: qaReport,
      figWidth,
      columns,
      preset,
    });

    return {
      imageUrl: `/api/charts/${outputName}`,
      svgUrl: fs.existsSync(svgPath) ? `/api/charts/${svgName}` : undefined,
      pdfUrl: fs.existsSync(pdfPath) ? `/api/charts/${pdfName}` : undefined,
      csvUrl: exportManifest.files.csv,
      fileName: outputName,
      baseName,
      styleValidation,
      qaReport,
      chartSpec,
      specPatches: specPatches.length > 0 ? specPatches : undefined,
      renderCount,
      figWidth,
      columns,
      preset,
      exportManifest,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function parseQaFromMeta(meta: Record<string, unknown>): ChartQaReport | undefined {
  const parsed = parseChartQaReport(meta.qaReport);
  if (parsed) return parsed;
  if (meta.styleValidation && typeof meta.styleValidation === "object") {
    return liftStyleValidation(meta.styleValidation as ChartStyleValidation);
  }
  return undefined;
}

function spawnChartPython(input: {
  scriptPath: string;
  dataPath: string;
  configPath: string;
  outputPath: string;
}): Promise<{ success: boolean; error?: string; meta?: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const proc = spawn(
      PYTHON_CMD,
      [input.scriptPath, "--data", input.dataPath, "--config", input.configPath, "--output", input.outputPath],
      {
        shell: false,
        env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
      },
    );

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          error: stderr || stdout || `Python 进程退出码 ${code}`,
        });
        return;
      }
      let meta: Record<string, unknown> | undefined;
      try {
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
        if (line) meta = JSON.parse(line) as Record<string, unknown>;
      } catch {
        meta = undefined;
      }
      resolve({ success: true, meta });
    });
    proc.on("error", (err) => {
      resolve({ success: false, error: formatPythonSpawnError(getErrorMessage(err)) });
    });
  });
}

/** registry.json 中 endpoint=/api/chart 的 figure id */
export const AGENT_CHART_TYPES = [
  "bar_grouped",
  "bar_stacked",
  "bar_pct_stacked",
  "line",
  "scatter",
  "pie",
  "heatmap",
  "area",
  "forest",
  "radar",
] as const;

export type AgentChartType = (typeof AGENT_CHART_TYPES)[number];

export function isAgentChartType(value: string): value is AgentChartType {
  return (AGENT_CHART_TYPES as readonly string[]).includes(value);
}
