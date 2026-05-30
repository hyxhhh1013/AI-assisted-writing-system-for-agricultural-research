import { logger } from "@/lib/logger";
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

if (!fs.existsSync(CHARTS_DIR)) {
  fs.mkdirSync(CHARTS_DIR, { recursive: true });
}

/**
 * 布拉格优化
 * POST /api/xrd/bragg
 * Body: JSON { crystal_system, lattice_init, hkl, exp_angles, wavelength, title }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { crystal_system, lattice_init, hkl, exp_angles, wavelength, title } = body;

    if (!crystal_system || !lattice_init || !hkl || !exp_angles) {
      return NextResponse.json(
        { error: "缺少必要参数: crystal_system, lattice_init, hkl, exp_angles" },
        { status: 400 }
      );
    }

    const tmpDir = path.join(process.cwd(), ".tmp", randomUUID());
    fs.mkdirSync(tmpDir, { recursive: true });

    const config = {
      crystal_system,
      lattice_init,
      hkl,
      exp_angles,
      wavelength: wavelength || 1.54056,
      title: title || "Bragg Optimization",
    };

    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify(config), "utf-8");

    const outputName = `${randomUUID()}.png`;
    const outputPath = path.join(CHARTS_DIR, outputName);
    const scriptPath = path.join(SCRIPTS_DIR, "xrd_bragg.py");

    let stdout = "";
    let stderr = "";

    const exitCode = await new Promise<number>((resolve, reject) => {
      const proc = spawn(PYTHON_CMD, [
        scriptPath, "--config", configPath, "--output", outputPath,
      ], { shell: false, env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" } });
      proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on("close", resolve);
      proc.on("error", reject);
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });

    if (exitCode !== 0) {
      return NextResponse.json(
        { error: `布拉格优化失败: ${stderr || stdout}` },
        { status: 500 }
      );
    }

    let pyResult: any = {};
    try {
      pyResult = JSON.parse(stdout.trim());
    } catch {
      return NextResponse.json({ error: "解析 Python 输出失败" }, { status: 500 });
    }

    if (pyResult.status !== "ok") {
      return NextResponse.json({ error: pyResult.message || "优化失败" }, { status: 500 });
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
  } catch (error: any) {
    logger.error("Bragg API error:", error);
    return NextResponse.json({ error: error.message || "优化失败" }, { status: 500 });
  }
}
