import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getErrorMessage } from "@/lib/error-utils";
import { PYTHON_CMD } from "@/services/xrd-runner";

export const runtime = "nodejs";
export const maxDuration = 120;

const CHARTS_DIR = path.join(process.cwd(), "data", "charts");
const SCRIPTS_DIR = path.join(process.cwd(), "scripts", "charts");
const GRAPHVIZ_BIN =
  process.platform === "win32" ? "C:\\Program Files\\Graphviz\\bin" : "/usr/bin";

if (!fs.existsSync(CHARTS_DIR)) {
  fs.mkdirSync(CHARTS_DIR, { recursive: true });
}

/**
 * POST /api/mechanism-panel
 * 多面板机理图合成；可含上传素材（FormData）或纯 JSON。
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let config: Record<string, unknown>;
    const assetMap: Record<string, string> = {};

    const tmpDir = path.join(process.cwd(), ".tmp", randomUUID());
    fs.mkdirSync(tmpDir, { recursive: true });

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const raw = form.get("config");
      if (typeof raw !== "string") {
        return NextResponse.json({ error: "缺少 config JSON" }, { status: 400 });
      }
      config = JSON.parse(raw) as Record<string, unknown>;
      for (const [key, value] of form.entries()) {
        if (key === "config" || !(value instanceof File)) continue;
        const dest = path.join(tmpDir, `${key}_${value.name}`.replace(/[^\w.\-]+/g, "_"));
        fs.writeFileSync(dest, Buffer.from(await value.arrayBuffer()));
        assetMap[key] = dest;
      }
    } else {
      config = (await req.json()) as Record<string, unknown>;
    }

    // 把 asset:xxx 引用替换为临时路径
    const panels = Array.isArray(config.panels) ? config.panels : [];
    for (const panel of panels) {
      if (!panel || typeof panel !== "object") continue;
      const blocks = (panel as { blocks?: unknown }).blocks;
      if (!Array.isArray(blocks)) continue;
      for (const block of blocks) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        const assetKey = typeof b.assetKey === "string" ? b.assetKey : null;
        if (assetKey && assetMap[assetKey]) {
          b.path = assetMap[assetKey];
        }
      }
    }

    if (!Array.isArray(config.panels) || config.panels.length === 0) {
      return NextResponse.json({ error: "至少需要一个 panel" }, { status: 400 });
    }

    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify(config), "utf-8");

    const id = randomUUID();
    const outputName = `${id}.png`;
    const outputPath = path.join(CHARTS_DIR, outputName);
    const scriptPath = path.join(SCRIPTS_DIR, "mechanism_panel.py");

    let stdout = "";
    let stderr = "";
    const exitCode = await new Promise<number>((resolve, reject) => {
      const proc = spawn(PYTHON_CMD, [scriptPath, "--config", configPath, "--output", outputPath], {
        shell: false,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1",
          PATH: `${process.env.PATH};${GRAPHVIZ_BIN}`,
        },
      });
      proc.stdout.on("data", (c: Buffer) => {
        stdout += c.toString();
      });
      proc.stderr.on("data", (c: Buffer) => {
        stderr += c.toString();
      });
      proc.on("close", resolve);
      proc.on("error", reject);
    });

    // 把 Python 写出的 svg/pdf 从 charts 目录识别；清理 tmp
    fs.rmSync(tmpDir, { recursive: true, force: true });

    if (exitCode !== 0) {
      return NextResponse.json({ error: `合成失败: ${stderr || stdout}` }, { status: 500 });
    }

    let pyResult: { status: string; message?: string; outputs?: Record<string, string> };
    try {
      pyResult = JSON.parse(stdout.trim()) as typeof pyResult;
    } catch {
      return NextResponse.json({ error: "解析 Python 输出失败" }, { status: 500 });
    }
    if (pyResult.status !== "ok") {
      return NextResponse.json({ error: pyResult.message || "合成失败" }, { status: 500 });
    }
    if (!fs.existsSync(outputPath)) {
      return NextResponse.json({ error: "图片生成失败" }, { status: 500 });
    }

    const base64 = fs.readFileSync(outputPath).toString("base64");
    const siblingSvg = path.join(CHARTS_DIR, `${id}.svg`);
    const siblingPdf = path.join(CHARTS_DIR, `${id}.pdf`);

    return NextResponse.json({
      imageBase64: `data:image/png;base64,${base64}`,
      imageUrl: `/api/charts/${outputName}`,
      svgUrl: fs.existsSync(siblingSvg) ? `/api/charts/${id}.svg` : undefined,
      pdfUrl: fs.existsSync(siblingPdf) ? `/api/charts/${id}.pdf` : undefined,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? getErrorMessage(error) : "未知错误" },
      { status: 500 },
    );
  }
}
