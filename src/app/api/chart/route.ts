import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { parseOptionalJsonConfig } from "@/lib/api-validate";
import { chartModeSchema } from "@/lib/validations";
import { getErrorMessage } from "@/lib/error-utils";

export const runtime = "nodejs";
export const maxDuration = 120;

const CHARTS_DIR = path.join(process.cwd(), "data", "charts");
const SCRIPTS_DIR = path.join(process.cwd(), "scripts", "charts");

const PYTHON_CMD = process.env.PYTHON_CMD || (process.platform === "win32" ? "python" : "python3");

// 确保图表输出目录存在
if (!fs.existsSync(CHARTS_DIR)) {
  fs.mkdirSync(CHARTS_DIR, { recursive: true });
}

/**
 * 调用 Python 脚本生成图表
 * POST /api/chart
 * Body: FormData { dataFile: File, config: string(JSON), mode: "generic" | "crd" }
 *
 * 响应: { imageUrl: string, fileName: string }
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const dataFile = formData.get("dataFile") as File | null;
    const configStr = formData.get("config") as string | null;
    const modeRaw = formData.get("mode");
    const modeResult = chartModeSchema.safeParse(
      typeof modeRaw === "string" && modeRaw ? modeRaw : "generic",
    );
    if (!modeResult.success) {
      return NextResponse.json({ error: "图表模式无效" }, { status: 400 });
    }
    const mode = modeResult.data;

    if (!dataFile) {
      return NextResponse.json({ error: "请上传数据文件" }, { status: 400 });
    }

    const { data: config, errorResponse: configError } = parseOptionalJsonConfig(configStr);
    if (configError) return configError;

    // 保存上传的数据文件到临时目录
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

    // 输出路径
    const outputName = `${randomUUID()}.png`;
    const outputPath = path.join(CHARTS_DIR, outputName);

    // 选择 Python 脚本
    const scriptName = mode === "crd" ? "plot_crd.py" : "plot_generic.py";
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);

    // 调 Python（使用 shell 确保 Windows 下能找到 PATH 中的 Python）
    const result = await new Promise<{ success: boolean; error?: string }>(
      (resolve) => {
        const proc = spawn(PYTHON_CMD, [
          scriptPath,
          "--data", dataPath,
          "--config", configPath,
          "--output", outputPath,
        ], { shell: false, env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" } });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });

        proc.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        proc.on("close", (code) => {
          // 清理临时文件
          fs.rmSync(tmpDir, { recursive: true, force: true });

          if (code !== 0) {
            resolve({
              success: false,
              error: stderr || stdout || `Python 进程退出码 ${code}`,
            });
          } else {
            resolve({ success: true });
          }
        });

        proc.on("error", (err) => {
          resolve({ success: false, error: getErrorMessage(err) });
        });
      }
    );

    if (!result.success) {
      return NextResponse.json(
        { error: `图表生成失败: ${result.error}` },
        { status: 500 }
      );
    }

    if (!fs.existsSync(outputPath)) {
      return NextResponse.json(
        { error: "图表生成失败: 输出文件未创建" },
        { status: 500 }
      );
    }

    // 读取生成的图片（保留文件供插入论文使用）
    const imageBuffer = fs.readFileSync(outputPath);
    const base64 = imageBuffer.toString("base64");
    const mimeType = "image/png";

    return NextResponse.json({
      imageBase64: `data:${mimeType};base64,${base64}`,
      imageUrl: `/api/charts/${outputName}`,
      fileName: outputName,
    });
  } catch (error: unknown) {
    logger.error("Chart API error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "图表生成失败" },
      { status: 500 }
    );
  }
}
