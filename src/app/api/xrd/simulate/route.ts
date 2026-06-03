import { logger } from "@/lib/logger";
import type { XrdPythonJsonResult } from "@/contracts/xrd-python";
import { getErrorMessage } from "@/lib/error-utils";
﻿import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 120;

const CHARTS_DIR = path.join(process.cwd(), "data", "charts");
const SCRIPTS_DIR = path.join(process.cwd(), "scripts", "charts");
import { PYTHON_CMD } from "@/services/xrd-runner";
import { parseOptionalJsonConfig } from "@/lib/api-validate";

if (!fs.existsSync(CHARTS_DIR)) {
  fs.mkdirSync(CHARTS_DIR, { recursive: true });
}

/**
 * XRD 模拟
 * POST /api/xrd/simulate
 * Body: FormData { cifFile: File, config: string(JSON) }
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const cifFile = formData.get("cifFile") as File | null;
    const configStr = formData.get("config") as string | null;

    if (!cifFile) {
      return NextResponse.json({ error: "请上传 CIF 结构文件" }, { status: 400 });
    }

    const { data: config, errorResponse: configError } = parseOptionalJsonConfig(configStr);
    if (configError) return configError;

    const tmpDir = path.join(process.cwd(), ".tmp", randomUUID());
    fs.mkdirSync(tmpDir, { recursive: true });

    const cifPath = path.join(tmpDir, "structure.cif");
    const buffer = Buffer.from(await cifFile.arrayBuffer());
    fs.writeFileSync(cifPath, buffer);

    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify(config), "utf-8");

    const outputName = `${randomUUID()}.png`;
    const outputPath = path.join(CHARTS_DIR, outputName);
    const scriptPath = path.join(SCRIPTS_DIR, "xrd_simulate.py");

    let stdout = "";
    let stderr = "";

    const exitCode = await new Promise<number>((resolve, reject) => {
      const proc = spawn(PYTHON_CMD, [
        scriptPath, "--cif", cifPath,
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
        { error: `模拟失败: ${stderr || stdout}` },
        { status: 500 }
      );
    }

    let pyResult: XrdPythonJsonResult = {};
    try { pyResult = JSON.parse(stdout.trim()); }
    catch { return NextResponse.json({ error: "解析 Python 输出失败" }, { status: 500 }); }

    if (pyResult.status !== "ok") {
      return NextResponse.json({ error: pyResult.message || "模拟失败" }, { status: 500 });
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
    logger.error("Simulate API error:", error);
    return NextResponse.json({ error: getErrorMessage(error) || "模拟失败" }, { status: 500 });
  }
}
