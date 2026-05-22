import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 120;

const CHARTS_DIR = path.join(process.cwd(), "public", "charts");
const SCRIPTS_DIR = path.join(process.cwd(), "scripts", "charts");

// conda pyxplore 环境 Python 路径
import { PYTHON_CMD } from "@/services/xrd-runner";

if (!fs.existsSync(CHARTS_DIR)) {
  fs.mkdirSync(CHARTS_DIR, { recursive: true });
} else {
  // 清理 1 小时前的旧图表文件
  try {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const f of fs.readdirSync(CHARTS_DIR)) {
      const p = path.join(CHARTS_DIR, f);
      if (f.endsWith(".png") && fs.statSync(p).mtimeMs < oneHourAgo) {
        fs.unlinkSync(p);
      }
    }
  } catch { /* cleanup is best-effort */ }
}

/**
 * XRD 峰分解
 * POST /api/xrd/peakfit
 * Body: FormData { dataFile: File, config: string(JSON) }
 *
 * 响应: { imageBase64: string, data: { n_peaks, peaks, bg_std_dev } }
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const dataFile = formData.get("dataFile") as File | null;
    const configStr = formData.get("config") as string | null;

    if (!dataFile) {
      return NextResponse.json({ error: "请上传 XRD 数据文件" }, { status: 400 });
    }

    let config: Record<string, any> = {};
    if (configStr) {
      try {
        config = JSON.parse(configStr);
      } catch {
        return NextResponse.json({ error: "配置格式错误" }, { status: 400 });
      }
    }

    // 保存上传文件到临时目录
    const tmpDir = path.join(process.cwd(), ".tmp", randomUUID());
    fs.mkdirSync(tmpDir, { recursive: true });

    const originalName = dataFile.name.toLowerCase();
    const ext = originalName.endsWith(".xlsx") ? ".xlsx"
      : originalName.endsWith(".xls") ? ".xls"
      : originalName.endsWith(".csv") ? ".csv"
      : originalName.endsWith(".tsv") ? ".tsv"
      : originalName.endsWith(".txt") ? ".txt"
      : ".csv";
    const dataPath = path.join(tmpDir, `data${ext}`);
    const buffer = Buffer.from(await dataFile.arrayBuffer());
    fs.writeFileSync(dataPath, buffer);

    // 写入配置
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify(config), "utf-8");

    // 输出 PNG 路径
    const outputName = `${randomUUID()}.png`;
    const outputPath = path.join(CHARTS_DIR, outputName);

    // 调用 Python
    const scriptPath = path.join(SCRIPTS_DIR, "xrd_peakfit.py");
    let stdout = "";
    let stderr = "";

    const exitCode = await new Promise<number>((resolve, reject) => {
      const proc = spawn(PYTHON_CMD, [
        scriptPath,
        "--data", dataPath,
        "--config", configPath,
        "--output", outputPath,
      ], { shell: false, env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" } });

      proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on("close", resolve);
      proc.on("error", reject);
    });

    // 清理临时文件
    fs.rmSync(tmpDir, { recursive: true, force: true });

    if (exitCode !== 0) {
      return NextResponse.json(
        { error: `分析失败: ${stderr || stdout}` },
        { status: 500 }
      );
    }

    // 解析 Python 输出的 JSON
    let pyResult: any = {};
    try {
      pyResult = JSON.parse(stdout.trim());
    } catch {
      return NextResponse.json(
        { error: "解析 Python 输出失败" },
        { status: 500 }
      );
    }

    if (pyResult.status !== "ok") {
      return NextResponse.json(
        { error: pyResult.message || "分析失败" },
        { status: 500 }
      );
    }

    // 读取生成的图片（保留文件供插入论文使用）
    if (!fs.existsSync(outputPath)) {
      return NextResponse.json(
        { error: "图片生成失败" },
        { status: 500 }
      );
    }

    const imageBuffer = fs.readFileSync(outputPath);
    const base64 = imageBuffer.toString("base64");

    // 返回 base64（供面板预览）和 imageUrl（供插入编辑器，短而干净）
    return NextResponse.json({
      imageBase64: `data:image/png;base64,${base64}`,
      imageUrl: `/charts/${outputName}`,
      data: pyResult.data,
    });
  } catch (error: any) {
    console.error("XRD peakfit API error:", error);
    return NextResponse.json(
      { error: error.message || "分析失败" },
      { status: 500 }
    );
  }
}
