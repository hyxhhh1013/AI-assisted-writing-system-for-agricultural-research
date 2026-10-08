/**
 * 多面板复合图生成：服务端 spawn scripts/charts/panel_multi.py。
 * 每个面板复用 plot_generic 的 CSV 解析（含 _sd/_se/_ci 误差棒），合成 a/b/c 期刊网格图。
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getErrorMessage } from "@/lib/error-utils";
import { PYTHON_CMD, formatPythonSpawnError } from "@/lib/python-cmd";
import { ensureChartsDir } from "@/lib/charts-dir";

const SCRIPTS_DIR = path.join(process.cwd(), "scripts", "charts");

export interface PanelSpec {
  chartType: string;
  csv: string;
  title?: string;
  xLabel?: string;
  yLabel?: string;
  yMin?: string;
  yMax?: string;
  showLegend?: boolean;
  palette?: string;
  /** 1 或 2。2 只在列数 ≥ 2 时占满两列 */
  span?: 1 | 2;
  /** 谱图面板：横轴从高到低（红外、XPS） */
  xReverse?: boolean;
  offset?: number;
  normalize?: boolean;
  seriesLabels?: boolean;
  peaks?: { x: number; label: string; marker?: string; series?: string }[];
  guides?: { x: number; label: string }[];
}

export interface RunPanelInput {
  title: string;
  preset?: "nature" | "agr_journal" | "print_bw";
  /** 不传则沿用脚本里的自动列数 */
  cols?: 1 | 2 | 3;
  panels: PanelSpec[];
}

export interface RunPanelResult {
  imageUrl: string;
  fileName: string;
  panelCount: number;
}

export async function runPanelGeneration(
  input: RunPanelInput,
): Promise<RunPanelResult> {
  const CHARTS_DIR = ensureChartsDir();

  const tmpDir = path.join(process.cwd(), ".tmp", randomUUID());
  fs.mkdirSync(tmpDir, { recursive: true });
  const configPath = path.join(tmpDir, "config.json");
  const pyConfig = {
    title: input.title,
    preset: input.preset ?? "nature",
    ...(input.cols ? { cols: input.cols } : {}),
    panels: input.panels.map((panel) => ({
      chartType: panel.chartType,
      csv: panel.csv,
      title: panel.title ?? "",
      x_label: panel.xLabel ?? "",
      y_label: panel.yLabel ?? "",
      ...(panel.yMin?.trim() ? { y_min: panel.yMin.trim() } : {}),
      ...(panel.yMax?.trim() ? { y_max: panel.yMax.trim() } : {}),
      ...(panel.showLegend === false ? { show_legend: false } : {}),
      ...(panel.palette?.trim() ? { palette: panel.palette.trim() } : {}),
      ...(panel.span === 2 ? { span: 2 } : {}),
      ...(panel.xReverse ? { x_reverse: true } : {}),
      ...(panel.offset != null ? { offset: panel.offset } : {}),
      ...(panel.normalize != null ? { normalize: panel.normalize } : {}),
      ...(panel.seriesLabels != null ? { series_labels: panel.seriesLabels } : {}),
      ...(panel.peaks && panel.peaks.length > 0 ? { peaks: panel.peaks } : {}),
      ...(panel.guides && panel.guides.length > 0 ? { guides: panel.guides } : {}),
    })),
  };
  fs.writeFileSync(configPath, JSON.stringify(pyConfig), "utf-8");

  const outputName = `${randomUUID()}.png`;
  const outputPath = path.join(CHARTS_DIR, outputName);
  const scriptPath = path.join(SCRIPTS_DIR, "panel_multi.py");

  try {
    const result = await new Promise<{ ok: boolean; error?: string }>(
      (resolve) => {
        const proc = spawn(
          PYTHON_CMD,
          [scriptPath, "--config", configPath, "--output", outputPath],
          {
            shell: false,
            env: {
              ...process.env,
              PYTHONIOENCODING: "utf-8",
              PYTHONUTF8: "1",
            },
          },
        );
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (c: Buffer) => {
          stdout += c.toString();
        });
        proc.stderr.on("data", (c: Buffer) => {
          stderr += c.toString();
        });
        proc.on("close", (code) => {
          if (code !== 0) {
            resolve({ ok: false, error: stderr || stdout });
            return;
          }
          resolve({ ok: true });
        });
        proc.on("error", (err) => {
          resolve({ ok: false, error: formatPythonSpawnError(getErrorMessage(err)) });
        });
      },
    );

    if (!result.ok) {
      throw new Error(result.error ?? "多面板图生成失败");
    }
    if (!fs.existsSync(outputPath)) {
      throw new Error("多面板图生成失败: 输出文件未创建");
    }

    return {
      imageUrl: `/api/charts/${outputName}`,
      fileName: outputName,
      panelCount: input.panels.length,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
