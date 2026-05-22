import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

const CHARTS_DIR = path.join(process.cwd(), "public", "charts");
const SCRIPTS_DIR = path.join(process.cwd(), "scripts", "charts");
import { PYTHON_CMD } from "@/services/xrd-runner";

if (!fs.existsSync(CHARTS_DIR)) {
  fs.mkdirSync(CHARTS_DIR, { recursive: true });
}

interface MolConfig {
  smiles: string;
  label?: string;
  size?: number;
}

interface ReactionConfig {
  title?: string;
  reactants: MolConfig[];
  products: MolConfig[];
  conditions?: string;
}

/**
 * 分子结构图 / 反应式渲染
 * POST /api/mol-diagram
 * Body: JSON { type: "mol" | "reaction", config: MolConfig | ReactionConfig }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, config } = body as { type: string; config: unknown };

    if (!type || !config) {
      return NextResponse.json({ error: "缺少 type 或 config" }, { status: 400 });
    }

    if (type === "mol") {
      const molCfg = config as MolConfig;
      if (!molCfg.smiles) {
        return NextResponse.json({ error: "缺少 SMILES" }, { status: 400 });
      }
    } else if (type === "reaction") {
      const rxnCfg = config as ReactionConfig;
      if (!rxnCfg.reactants || rxnCfg.reactants.length === 0) {
        return NextResponse.json({ error: "反应式缺少反应物" }, { status: 400 });
      }
      if (!rxnCfg.products || rxnCfg.products.length === 0) {
        return NextResponse.json({ error: "反应式缺少产物" }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "type 必须为 mol 或 reaction" }, { status: 400 });
    }

    const tmpDir = path.join(process.cwd(), ".tmp", randomUUID());
    fs.mkdirSync(tmpDir, { recursive: true });

    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({ type, config }), "utf-8");

    const outputName = `${randomUUID()}.png`;
    const outputPath = path.join(CHARTS_DIR, outputName);
    const scriptPath = path.join(SCRIPTS_DIR, "mol_diagram.py");

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
        { error: `渲染失败: ${stderr || stdout}` },
        { status: 500 },
      );
    }

    let pyResult: { status: string; message?: string; data?: unknown };
    try {
      pyResult = JSON.parse(stdout.trim());
    } catch {
      return NextResponse.json({ error: "解析 Python 输出失败" }, { status: 500 });
    }

    if (pyResult.status !== "ok") {
      return NextResponse.json(
        { error: pyResult.message || "渲染失败" },
        { status: 500 },
      );
    }

    if (!fs.existsSync(outputPath)) {
      return NextResponse.json({ error: "图片生成失败" }, { status: 500 });
    }

    const imageBuffer = fs.readFileSync(outputPath);
    const base64 = imageBuffer.toString("base64");

    return NextResponse.json({
      imageBase64: `data:image/png;base64,${base64}`,
      imageUrl: `/charts/${outputName}`,
      data: pyResult.data,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
