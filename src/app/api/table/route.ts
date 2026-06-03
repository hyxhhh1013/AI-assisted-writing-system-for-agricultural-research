import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { validateBody } from "@/lib/api-validate";
import { tableGenerateSchema } from "@/lib/validations";
import { getErrorMessage } from "@/lib/error-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

const SCRIPTS_DIR = path.join(process.cwd(), "scripts", "charts");
const PYTHON_CMD = process.env.PYTHON_CMD || (process.platform === "win32" ? "python" : "python3");

/**
 * 生成 GB/T 7714 三线表 + 统计文字
 * POST /api/table
 * Body: JSON {
 *   title, groups, anova?, posthoc?, alpha?, note?, column_header?
 * }
 *
 * 响应: { latex, html, statsText, letters }
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => null);
    const { data: body, errorResponse: ve } = await validateBody(tableGenerateSchema, rawBody);
    if (ve) return ve;

    // 写入临时配置文件
    const tmpDir = path.join(process.cwd(), ".tmp", randomUUID());
    fs.mkdirSync(tmpDir, { recursive: true });

    const configPath = path.join(tmpDir, "table_config.json");
    fs.writeFileSync(configPath, JSON.stringify(body, null, 2), "utf-8");

    // 调 Python
    const scriptPath = path.join(SCRIPTS_DIR, "make_table.py");

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(PYTHON_CMD, [
        scriptPath,
        "--config", configPath,
        "--output", tmpDir,
      ], { shell: false, env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" } });

      let stderr = "";
      proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on("close", (code) => {
        if (code !== 0) reject(new Error(stderr || `Python 进程退出码 ${code}`));
        else resolve();
      });
      proc.on("error", reject);
    });

    // 从文件读取结果，绕开管道编码问题
    const resultPath = path.join(tmpDir, "result.json");
    const resultJson = JSON.parse(fs.readFileSync(resultPath, "utf-8"));

    // 清理临时文件
    fs.rmSync(tmpDir, { recursive: true, force: true });

    if (resultJson.status !== "ok") {
      return NextResponse.json(
        { error: resultJson.message || "三线表生成失败" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      latex: resultJson.latex,
      html: resultJson.html,
      statsText: resultJson.stats_text,
      letters: resultJson.letters,
    });
  } catch (error: unknown) {
    logger.error("Table API error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "三线表生成失败" },
      { status: 500 }
    );
  }
}
