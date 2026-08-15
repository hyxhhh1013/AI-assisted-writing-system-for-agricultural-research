import { logger } from "@/lib/logger";
import type { XrdPythonJsonResult } from "@/contracts/xrd-python";
import { getErrorMessage } from "@/lib/error-utils";
import { ensureChartsDir } from "@/lib/charts-dir";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { PYTHON_CMD } from "@/services/xrd-runner";
import { parseOptionalJsonConfig } from "@/lib/api-validate";
import { resolveXrdUploadExt } from "@/lib/xrd-file-ext";

export const runtime = "nodejs";
export const maxDuration = 300;

const CHARTS_DIR = ensureChartsDir();
const SCRIPTS_DIR = path.join(process.cwd(), "scripts", "charts");

/**
 * XPS 分析
 * POST /api/xrd/xps
 * Body: FormData { dataFile: File, config: string(JSON) }
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const dataFile = formData.get("dataFile") as File | null;
    const configStr = formData.get("config") as string | null;

    if (!dataFile) {
      return NextResponse.json({ error: "请上传 XPS 数据文件" }, { status: 400 });
    }

    const { data: config, errorResponse: configError } = parseOptionalJsonConfig(configStr);
    if (configError) return configError;

    if (!config.atom_identifiers || !Array.isArray(config.atom_identifiers) || config.atom_identifiers.length === 0) {
      return NextResponse.json({ error: "请提供原子标识符 (atom_identifiers)" }, { status: 400 });
    }

    const tmpDir = path.join(process.cwd(), ".tmp", randomUUID());
    fs.mkdirSync(tmpDir, { recursive: true });

    const ext = resolveXrdUploadExt(dataFile.name);
    const dataPath = path.join(tmpDir, `data${ext}`);
    const buffer = Buffer.from(await dataFile.arrayBuffer());
    fs.writeFileSync(dataPath, buffer);

    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify(config), "utf-8");

    const outputName = `${randomUUID()}.png`;
    const outputPath = path.join(CHARTS_DIR, outputName);
    const scriptPath = path.join(SCRIPTS_DIR, "xrd_xps.py");

    let stdout = "";
    let stderr = "";

    const exitCode = await new Promise<number>((resolve, reject) => {
      const proc = spawn(PYTHON_CMD, [
        scriptPath, "--data", dataPath,
        "--config", configPath, "--output", outputPath,
      ], { shell: false, env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" } });
      proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on("close", resolve);
      proc.on("error", reject);
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });

    if (exitCode !== 0) {
      return NextResponse.json(
        { error: `XPS 分析失败: ${stderr || stdout}` },
        { status: 500 }
      );
    }

    let pyResult: XrdPythonJsonResult = {};
    try {
      // 从 stdout 提取最后一段完整 JSON（容忍前缀调试输出）
      const lines = stdout.trim().split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith("{")) {
          pyResult = JSON.parse(line);
          break;
        }
      }
      if (!pyResult.status) throw new Error("未找到有效 JSON 输出");
    }
    catch { return NextResponse.json({ error: "解析 Python 输出失败", detail: stdout.slice(-500) }, { status: 500 }); }

    if (pyResult.status !== "ok") {
      return NextResponse.json({ error: pyResult.message || "分析失败" }, { status: 500 });
    }

    if (!fs.existsSync(outputPath)) {
      return NextResponse.json({ error: "图片生成失败" }, { status: 500 });
    }

    const imageBuffer = fs.readFileSync(outputPath);
    const base64 = imageBuffer.toString("base64");

    return NextResponse.json({
      imageBase64: `data:image/png;base64,${base64}`,
      imageUrl: `/api/charts/${outputName}`,
      data: pyResult.data,
    });
  } catch (error: unknown) {
    logger.error("XPS API error:", error);
    return NextResponse.json({ error: getErrorMessage(error) || "分析失败" }, { status: 500 });
  }
}
