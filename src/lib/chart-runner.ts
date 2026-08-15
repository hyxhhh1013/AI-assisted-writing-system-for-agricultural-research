import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getErrorMessage } from "@/lib/error-utils";
import { PYTHON_CMD, formatPythonSpawnError } from "@/lib/python-cmd";
import { ensureChartsDir } from "@/lib/charts-dir";

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
  figWidth?: number;
  columns?: number;
  preset?: string;
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
  fs.writeFileSync(configPath, JSON.stringify(input.config), "utf-8");

  const outputName = `${randomUUID()}.png`;
  const outputPath = path.join(CHARTS_DIR, outputName);
  const scriptName = mode === "crd" ? "plot_crd.py" : "plot_generic.py";
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);

  try {
    const result = await new Promise<{
      success: boolean;
      error?: string;
      meta?: Record<string, unknown>;
    }>((resolve) => {
      const proc = spawn(
        PYTHON_CMD,
        [scriptPath, "--data", dataPath, "--config", configPath, "--output", outputPath],
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
          const line = stdout
            .trim()
            .split(/\r?\n/)
            .filter(Boolean)
            .pop();
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

    if (!result.success) {
      throw new Error(result.error ?? "图表生成失败");
    }
    if (!fs.existsSync(outputPath)) {
      throw new Error("图表生成失败: 输出文件未创建");
    }

    const baseName = outputName.replace(/\.png$/i, "");
    const svgName = `${baseName}.svg`;
    const pdfName = `${baseName}.pdf`;
    const svgPath = path.join(CHARTS_DIR, svgName);
    const pdfPath = path.join(CHARTS_DIR, pdfName);

    const meta = result.meta ?? {};
    const styleValidation =
      meta.styleValidation && typeof meta.styleValidation === "object"
        ? (meta.styleValidation as ChartStyleValidation)
        : undefined;

    return {
      imageUrl: `/api/charts/${outputName}`,
      svgUrl: fs.existsSync(svgPath) ? `/api/charts/${svgName}` : undefined,
      pdfUrl: fs.existsSync(pdfPath) ? `/api/charts/${pdfName}` : undefined,
      fileName: outputName,
      baseName,
      styleValidation,
      figWidth: typeof meta.fig_width === "number" ? meta.fig_width : undefined,
      columns: typeof meta.columns === "number" ? meta.columns : undefined,
      preset: typeof meta.preset === "string" ? meta.preset : undefined,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
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
