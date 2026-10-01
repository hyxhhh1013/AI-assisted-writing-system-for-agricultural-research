import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { validateBody } from "@/lib/api-validate";
import { tableGenerateSchema } from "@/lib/validations";
import { getErrorMessage } from "@/lib/error-utils";
import { PYTHON_CMD, formatPythonSpawnError } from "@/lib/python-cmd";
import { ChildTimeoutError, runCommand } from "@/lib/python-runner";

export const runtime = "nodejs";
export const maxDuration = 60;

const SCRIPTS_DIR = path.join(process.cwd(), "scripts", "charts");

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

    const tmpDir = path.join(process.cwd(), ".tmp", randomUUID());
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      const configPath = path.join(tmpDir, "table_config.json");
      fs.writeFileSync(configPath, JSON.stringify(body, null, 2), "utf-8");

      const scriptPath = path.join(SCRIPTS_DIR, "make_table.py");
      const child = await runCommand(PYTHON_CMD, [
        scriptPath,
        "--config", configPath,
        "--output", tmpDir,
      ], {
        timeoutMs: 55_000,
        env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
      });
      if (child.code !== 0) {
        throw new Error(child.stderr || `Python 进程退出码 ${child.code}`);
      }

      const resultPath = path.join(tmpDir, "result.json");
      const resultJson = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
      if (resultJson.status !== "ok") {
        return NextResponse.json(
          { error: resultJson.message || "三线表生成失败" },
          { status: 500 },
        );
      }

      return NextResponse.json({
        latex: resultJson.latex,
        html: resultJson.html,
        statsText: resultJson.stats_text,
        letters: resultJson.letters,
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

  } catch (error: unknown) {
    logger.error("Table API error:", error);
    const timedOut = error instanceof ChildTimeoutError;
    return NextResponse.json(
      { error: timedOut ? error.message : (formatPythonSpawnError(getErrorMessage(error)) || "三线表生成失败") },
      { status: timedOut ? 504 : 500 },
    );
  }
}
