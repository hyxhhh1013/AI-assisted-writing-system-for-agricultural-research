import { logger } from "@/lib/logger";
﻿import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHARTS_DIR = path.join(process.cwd(), "data", "charts");
const SCRIPTS_DIR = path.join(process.cwd(), "scripts", "charts");
import { PYTHON_CMD } from "@/services/xrd-runner";

if (!fs.existsSync(CHARTS_DIR)) {
  fs.mkdirSync(CHARTS_DIR, { recursive: true });
}

/**
 * 晶胞可视化
 * POST /api/xrd/unitcell
 * Body: FormData { cifFile: File } 或 { params: JSON(string), atoms: JSON(string) }
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const cifFile = formData.get("cifFile") as File | null;
    const configStr = formData.get("config") as string | null;

    const tmpDir = path.join(process.cwd(), ".tmp", randomUUID());
    fs.mkdirSync(tmpDir, { recursive: true });

    const scriptPath = path.join(SCRIPTS_DIR, "xrd_unitcell.py");
    const outputName = `${randomUUID()}.png`;
    const outputPath = path.join(CHARTS_DIR, outputName);

    const args: string[] = [scriptPath, "--output", outputPath];

    if (cifFile) {
      // CIF 文件上传模式
      const cifPath = path.join(tmpDir, "structure.cif");
      const buffer = Buffer.from(await cifFile.arrayBuffer());
      fs.writeFileSync(cifPath, buffer);
      args.push("--cif", cifPath);

      if (configStr) {
        const configPath = path.join(tmpDir, "config.json");
        fs.writeFileSync(configPath, configStr, "utf-8");
        args.push("--config", configPath);
      }
    } else {
      // 手动参数模式
      const paramsStr = formData.get("params") as string;
      const atomsStr = formData.get("atoms") as string;
      if (!paramsStr || !atomsStr) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return NextResponse.json(
          { error: "请上传 CIF 文件或提供晶格参数 + 原子坐标" },
          { status: 400 }
        );
      }
      args.push("--params", paramsStr, "--atoms", atomsStr);
    }

    let stdout = "";
    let stderr = "";

    const exitCode = await new Promise<number>((resolve, reject) => {
      const proc = spawn(PYTHON_CMD, args, { shell: false, env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" } });
      proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on("close", resolve);
      proc.on("error", reject);
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });

    if (exitCode !== 0) {
      return NextResponse.json(
        { error: `晶胞可视化失败: ${stderr || stdout}` },
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
      return NextResponse.json({ error: pyResult.message || "可视化失败" }, { status: 500 });
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
    logger.error("UnitCell API error:", error);
    return NextResponse.json({ error: error.message || "可视化失败" }, { status: 500 });
  }
}
