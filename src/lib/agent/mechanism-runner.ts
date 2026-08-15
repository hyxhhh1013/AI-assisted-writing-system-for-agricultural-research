/**
 * 机理图 / 流程图生成：服务端 spawn scripts/charts 里的 flow_diagram_v2 / mechanism_panel。
 * 与 chart-runner（plot_generic）并列；这两个脚本只需 config + output，无需数据文件。
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getErrorMessage } from "@/lib/error-utils";
import { PYTHON_CMD, formatPythonSpawnError } from "@/lib/python-cmd";
import { ensureChartsDir } from "@/lib/charts-dir";

const SCRIPTS_DIR = path.join(process.cwd(), "scripts", "charts");
const GRAPHVIZ_BIN =
  process.platform === "win32"
    ? "C:\\Program Files\\Graphviz\\bin"
    : "/usr/bin";

const SCRIPT_BY_KIND = {
  flow: "flow_diagram_v2.py",
  mechanism_panel: "mechanism_panel.py",
} as const;

export type MechanismKind = keyof typeof SCRIPT_BY_KIND;

export interface RunMechanismResult {
  imageUrl: string;
  svgUrl?: string;
  pdfUrl?: string;
  fileName: string;
}

export async function runMechanismGeneration(
  kind: MechanismKind,
  config: Record<string, unknown>,
): Promise<RunMechanismResult> {
  const CHARTS_DIR = ensureChartsDir();

  const tmpDir = path.join(process.cwd(), ".tmp", randomUUID());
  fs.mkdirSync(tmpDir, { recursive: true });
  const configPath = path.join(tmpDir, "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config), "utf-8");

  const outputName = `${randomUUID()}.png`;
  const outputPath = path.join(CHARTS_DIR, outputName);
  const scriptPath = path.join(SCRIPTS_DIR, SCRIPT_BY_KIND[kind]);

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
              PATH: `${process.env.PATH};${GRAPHVIZ_BIN}`,
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
      throw new Error(result.error ?? "机理图生成失败");
    }
    if (!fs.existsSync(outputPath)) {
      throw new Error("机理图生成失败: 输出文件未创建");
    }

    const baseName = outputName.replace(/\.png$/i, "");
    const svgPath = path.join(CHARTS_DIR, `${baseName}.svg`);
    const pdfPath = path.join(CHARTS_DIR, `${baseName}.pdf`);

    return {
      imageUrl: `/api/charts/${outputName}`,
      svgUrl: fs.existsSync(svgPath) ? `/api/charts/${baseName}.svg` : undefined,
      pdfUrl: fs.existsSync(pdfPath) ? `/api/charts/${baseName}.pdf` : undefined,
      fileName: outputName,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
