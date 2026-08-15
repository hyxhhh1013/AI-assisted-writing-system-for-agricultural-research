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
import { ensureChartsDir } from "@/lib/charts-dir";

export const runtime = "nodejs";
export const maxDuration = 120;

const CHARTS_DIR = ensureChartsDir();
const SCRIPTS_DIR = path.join(process.cwd(), "scripts", "charts");

/**
 * VASP DOSCAR / EIGENVAL / PROCAR → DFT 图
 * POST /api/dft/vasp
 * FormData: kind=dos|band|procar, doscar?, eigenval?, outcar?, procar?, config?
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const kindRaw = String(formData.get("kind") ?? "dos").toLowerCase();
    const kind =
      kindRaw === "band" || kindRaw === "procar" || kindRaw === "band_proj" || kindRaw === "fatband"
        ? kindRaw === "band"
          ? "band"
          : "procar"
        : "dos";
    const configStr = formData.get("config") as string | null;
    const { data: config, errorResponse: configError } = parseOptionalJsonConfig(configStr);
    if (configError) return configError;

    const doscar = formData.get("doscar");
    const eigenval = formData.get("eigenval");
    const outcar = formData.get("outcar");
    const procar = formData.get("procar");

    if (kind === "dos" && !(doscar instanceof File)) {
      return NextResponse.json({ error: "请上传 DOSCAR" }, { status: 400 });
    }
    if (kind === "band" && !(eigenval instanceof File)) {
      return NextResponse.json({ error: "请上传 EIGENVAL" }, { status: 400 });
    }
    if (kind === "procar" && !(procar instanceof File)) {
      return NextResponse.json({ error: "请上传 PROCAR" }, { status: 400 });
    }

    const tmpDir = path.join(process.cwd(), ".tmp", randomUUID());
    fs.mkdirSync(tmpDir, { recursive: true });

    const args: string[] = [];
    if (doscar instanceof File) {
      const p = path.join(tmpDir, "DOSCAR");
      fs.writeFileSync(p, Buffer.from(await doscar.arrayBuffer()));
      args.push("--doscar", p);
    }
    if (eigenval instanceof File) {
      const p = path.join(tmpDir, "EIGENVAL");
      fs.writeFileSync(p, Buffer.from(await eigenval.arrayBuffer()));
      args.push("--eigenval", p);
    }
    if (outcar instanceof File) {
      const p = path.join(tmpDir, "OUTCAR");
      fs.writeFileSync(p, Buffer.from(await outcar.arrayBuffer()));
      args.push("--outcar", p);
    }
    if (procar instanceof File) {
      const p = path.join(tmpDir, "PROCAR");
      fs.writeFileSync(p, Buffer.from(await procar.arrayBuffer()));
      args.push("--procar", p);
    }

    const pyConfig = { ...config, kind };
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify(pyConfig), "utf-8");

    const outputName = `${randomUUID()}.png`;
    const outputPath = path.join(CHARTS_DIR, outputName);
    const scriptPath = path.join(SCRIPTS_DIR, "dft_vasp.py");

    let stdout = "";
    let stderr = "";
    const exitCode = await new Promise<number>((resolve, reject) => {
      const proc = spawn(
        PYTHON_CMD,
        [scriptPath, ...args, "--config", configPath, "--output", outputPath],
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
      return NextResponse.json({ error: `解析失败: ${stderr || stdout}` }, { status: 500 });
    }

    let pyResult: XrdPythonJsonResult = {};
    try {
      pyResult = JSON.parse(stdout.trim()) as XrdPythonJsonResult;
    } catch {
      return NextResponse.json({ error: "解析 Python 输出失败" }, { status: 500 });
    }
    if (pyResult.status !== "ok") {
      return NextResponse.json({ error: pyResult.message || "解析失败" }, { status: 500 });
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
    logger.error("DFT VASP API error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "解析失败" },
      { status: 500 },
    );
  }
}
