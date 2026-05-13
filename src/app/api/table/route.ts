import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

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
    const body = await req.json();

    if (!body.groups || !Array.isArray(body.groups) || body.groups.length < 2) {
      return NextResponse.json(
        { error: "请提供至少 2 个处理组数据（groups 数组）" },
        { status: 400 }
      );
    }

    // 写入临时配置文件
    const tmpDir = path.join(process.cwd(), ".tmp", randomUUID());
    fs.mkdirSync(tmpDir, { recursive: true });

    const configPath = path.join(tmpDir, "table_config.json");
    fs.writeFileSync(configPath, JSON.stringify(body, null, 2), "utf-8");

    // 调 Python
    const scriptPath = path.join(SCRIPTS_DIR, "make_table.py");

    const result = await new Promise<{ success: boolean; data?: any; error?: string }>(
      (resolve) => {
        const proc = spawn(PYTHON_CMD, [
          scriptPath,
          "--config", configPath,
          "--output", tmpDir,
        ], { shell: process.platform === "win32" });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });

        proc.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        proc.on("close", (code) => {
          if (code !== 0) {
            resolve({
              success: false,
              error: stderr || stdout || `Python 进程退出码 ${code}`,
            });
          } else {
            try {
              const data = JSON.parse(stdout.trim());
              if (data.status === "ok") {
                resolve({ success: true, data });
              } else {
                resolve({ success: false, error: data.message || "未知错误" });
              }
            } catch {
              resolve({ success: false, error: stdout || "无法解析 Python 输出" });
            }
          }
        });

        proc.on("error", (err) => {
          resolve({ success: false, error: err.message });
        });
      }
    );

    // 清理临时文件
    fs.rmSync(tmpDir, { recursive: true, force: true });

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: `三线表生成失败: ${result.error}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      latex: result.data.latex,
      html: result.data.html,
      statsText: result.data.stats_text,
      letters: result.data.letters,
    });
  } catch (error: any) {
    console.error("Table API error:", error);
    return NextResponse.json(
      { error: error.message || "三线表生成失败" },
      { status: 500 }
    );
  }
}
