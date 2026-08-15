import type { XrdPythonJsonResult } from "@/contracts/xrd-python";
import type { ScherrerData } from "@/services/xrd";
import { PYTHON_CMD } from "@/services/xrd-runner";
import type { XrdScherrerInput } from "@/lib/validations";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { ensureChartsDir } from "@/lib/charts-dir";

const SCRIPTS_DIR = path.join(process.cwd(), "scripts", "charts");

export interface ScherrerRunResult {
  imageUrl: string;
  imageBase64: string;
  data: ScherrerData;
}

/** 服务端 Scherrer 计算（Agent / API 共用） */
export async function runScherrerGeneration(
  body: XrdScherrerInput,
): Promise<ScherrerRunResult> {
  const CHARTS_DIR = ensureChartsDir();

  const tmpDir = path.join(process.cwd(), ".tmp", randomUUID());
  fs.mkdirSync(tmpDir, { recursive: true });

  const configPath = path.join(tmpDir, "config.json");
  fs.writeFileSync(configPath, JSON.stringify(body), "utf-8");

  const outputName = `${randomUUID()}.png`;
  const outputPath = path.join(CHARTS_DIR, outputName);
  const scriptPath = path.join(SCRIPTS_DIR, "xrd_scherrer.py");

  let stdout = "";
  let stderr = "";
  const exitCode = await new Promise<number>((resolve, reject) => {
    const proc = spawn(
      PYTHON_CMD,
      [scriptPath, "--config", configPath, "--output", outputPath],
      {
        shell: false,
        env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
      },
    );
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("close", resolve);
    proc.on("error", reject);
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });

  if (exitCode !== 0) {
    throw new Error(`Scherrer 计算失败: ${stderr || stdout}`);
  }

  let pyResult: XrdPythonJsonResult = {};
  try {
    pyResult = JSON.parse(stdout.trim()) as XrdPythonJsonResult;
  } catch {
    throw new Error("解析 Python 输出失败");
  }
  if (pyResult.status !== "ok") {
    throw new Error(pyResult.message || "Scherrer 计算失败");
  }
  if (!fs.existsSync(outputPath)) {
    throw new Error("图片生成失败");
  }

  const base64 = fs.readFileSync(outputPath).toString("base64");
  return {
    imageUrl: `/api/charts/${outputName}`,
    imageBase64: `data:image/png;base64,${base64}`,
    data: pyResult.data as ScherrerData,
  };
}
