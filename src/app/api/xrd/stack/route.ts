import { logger } from "@/lib/logger";
import type { XrdPythonJsonResult } from "@/contracts/xrd-python";
import { getErrorMessage } from "@/lib/error-utils";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { PYTHON_CMD } from "@/services/xrd-runner";
import { parseOptionalJsonConfig } from "@/lib/api-validate";
import { resolveXrdUploadExt } from "@/lib/xrd-file-ext";

export const runtime = "nodejs";
export const maxDuration = 120;

const CHARTS_DIR = path.join(process.cwd(), "data", "charts");
const SCRIPTS_DIR = path.join(process.cwd(), "scripts", "charts");

if (!fs.existsSync(CHARTS_DIR)) {
  fs.mkdirSync(CHARTS_DIR, { recursive: true });
}

/**
 * XRD 多谱 offset 叠加
 * POST /api/xrd/stack
 * FormData: dataFiles (File[]), labels? (JSON string[]), config? (JSON)
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const configStr = formData.get("config") as string | null;
    const labelsStr = formData.get("labels") as string | null;

    const { data: config, errorResponse: configError } = parseOptionalJsonConfig(configStr);
    if (configError) return configError;

    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (value instanceof File && (key === "dataFiles" || key.startsWith("dataFile"))) {
        files.push(value);
      }
    }
    if (files.length === 0) {
      return NextResponse.json({ error: "请至少上传一条 XRD 数据文件" }, { status: 400 });
    }
    if (files.length > 12) {
      return NextResponse.json({ error: "最多同时叠加 12 条谱" }, { status: 400 });
    }

    let labels: string[] = [];
    if (labelsStr) {
      try {
        const parsed: unknown = JSON.parse(labelsStr);
        if (Array.isArray(parsed)) {
          labels = parsed.map((v) => String(v));
        }
      } catch {
        return NextResponse.json({ error: "labels 必须是 JSON 数组" }, { status: 400 });
      }
    }

    const tmpDir = path.join(process.cwd(), ".tmp", randomUUID());
    fs.mkdirSync(tmpDir, { recursive: true });

    const fileEntries: { path: string; label: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = resolveXrdUploadExt(f.name);
      const dataPath = path.join(tmpDir, `data_${i}${ext}`);
      fs.writeFileSync(dataPath, Buffer.from(await f.arrayBuffer()));
      const label =
        labels[i]?.trim() ||
        path.basename(f.name, path.extname(f.name)) ||
        `Spectrum ${i + 1}`;
      fileEntries.push({ path: dataPath, label });
    }

    const pyConfig = {
      ...config,
      files: fileEntries,
    };
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify(pyConfig), "utf-8");

    const outputName = `${randomUUID()}.png`;
    const outputPath = path.join(CHARTS_DIR, outputName);
    const scriptPath = path.join(SCRIPTS_DIR, "xrd_stack.py");

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
      return NextResponse.json({ error: `叠加失败: ${stderr || stdout}` }, { status: 500 });
    }

    let pyResult: XrdPythonJsonResult = {};
    try {
      pyResult = JSON.parse(stdout.trim()) as XrdPythonJsonResult;
    } catch {
      return NextResponse.json({ error: "解析 Python 输出失败" }, { status: 500 });
    }
    if (pyResult.status !== "ok") {
      return NextResponse.json({ error: pyResult.message || "叠加失败" }, { status: 500 });
    }
    if (!fs.existsSync(outputPath)) {
      return NextResponse.json({ error: "图片生成失败" }, { status: 500 });
    }

    const base64 = fs.readFileSync(outputPath).toString("base64");
    return NextResponse.json({
      imageBase64: `data:image/png;base64,${base64}`,
      imageUrl: `/api/charts/${outputName}`,
      data: pyResult.data,
    });
  } catch (error: unknown) {
    logger.error("XRD stack API error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "叠加失败" },
      { status: 500 },
    );
  }
}
