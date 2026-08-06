import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getErrorMessage } from "@/lib/error-utils";
import { PYTHON_CMD } from "@/services/xrd-runner";

export const runtime = "nodejs";
export const maxDuration = 30;

const CHARTS_DIR = path.join(process.cwd(), "data", "charts");
const SCRIPTS_DIR = path.join(process.cwd(), "scripts", "charts");

const GRAPHVIZ_BIN =
  process.platform === "win32" ? "C:\\Program Files\\Graphviz\\bin" : "/usr/bin";

if (!fs.existsSync(CHARTS_DIR)) {
  fs.mkdirSync(CHARTS_DIR, { recursive: true });
}

interface FlowNode {
  id: string;
  label: string;
  shape?: "box" | "oval" | "diamond";
  role?: "process" | "decision" | "start_end" | "callout";
  color?: string;
}

interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

interface FlowConfig {
  title?: string;
  direction?: "vertical" | "horizontal";
  nodes: FlowNode[];
  edges: FlowEdge[];
  cols?: number;
  columns?: number;
  colors?: Record<string, string>;
  default_color?: string;
  renderer?: "matplotlib" | "graphviz";
  preset?: "nature" | "agr_journal" | "print_bw";
  export_formats?: string | string[];
  panel_label?: string;
}

interface PyFlowResult {
  status: string;
  message?: string;
  output?: string;
  outputs?: Record<string, string>;
  preset?: string;
}

function chartPublicUrl(filePath: string): string | undefined {
  const base = path.basename(filePath);
  if (!base) return undefined;
  return `/api/charts/${base}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as FlowConfig;

    if (!body.nodes || !Array.isArray(body.nodes) || body.nodes.length === 0) {
      return NextResponse.json({ error: "至少需要一个节点" }, { status: 400 });
    }

    const tmpDir = path.join(process.cwd(), ".tmp", randomUUID());
    fs.mkdirSync(tmpDir, { recursive: true });

    const configPath = path.join(tmpDir, "config.json");
    const pyBody = {
      ...body,
      preset: body.preset || "nature",
      export_formats: body.export_formats || "png,svg,pdf",
    };
    fs.writeFileSync(configPath, JSON.stringify(pyBody), "utf-8");

    const id = randomUUID();
    const outputName = `${id}.png`;
    const outputPath = path.join(CHARTS_DIR, outputName);
    const renderer = body.renderer || "graphviz";
    const scriptName = renderer === "matplotlib" ? "flow_diagram.py" : "flow_diagram_v2.py";
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);

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
      return NextResponse.json({ error: `渲染失败: ${stderr || stdout}` }, { status: 500 });
    }

    let pyResult: PyFlowResult;
    try {
      pyResult = JSON.parse(stdout.trim()) as PyFlowResult;
    } catch {
      return NextResponse.json({ error: "解析 Python 输出失败" }, { status: 500 });
    }

    if (pyResult.status !== "ok") {
      return NextResponse.json({ error: pyResult.message || "渲染失败" }, { status: 500 });
    }

    if (!fs.existsSync(outputPath)) {
      return NextResponse.json({ error: "图片生成失败" }, { status: 500 });
    }

    const imageBuffer = fs.readFileSync(outputPath);
    const base64 = imageBuffer.toString("base64");

    const outputs = pyResult.outputs ?? {};
    const svgPath = outputs.svg;
    const pdfPath = outputs.pdf;
    const svgUrl =
      svgPath && fs.existsSync(svgPath) ? chartPublicUrl(svgPath) : chartPublicUrl(`${id}.svg`);
    const pdfUrl =
      pdfPath && fs.existsSync(pdfPath) ? chartPublicUrl(pdfPath) : undefined;

    // 若 Python 写出了同 stem 的 svg/pdf，确认文件存在
    const siblingSvg = path.join(CHARTS_DIR, `${id}.svg`);
    const siblingPdf = path.join(CHARTS_DIR, `${id}.pdf`);

    return NextResponse.json({
      imageBase64: `data:image/png;base64,${base64}`,
      imageUrl: `/api/charts/${outputName}`,
      svgUrl: fs.existsSync(siblingSvg)
        ? `/api/charts/${id}.svg`
        : svgUrl && fs.existsSync(path.join(CHARTS_DIR, path.basename(svgUrl)))
          ? svgUrl
          : undefined,
      pdfUrl: fs.existsSync(siblingPdf)
        ? `/api/charts/${id}.pdf`
        : pdfUrl && fs.existsSync(path.join(CHARTS_DIR, path.basename(pdfUrl)))
          ? pdfUrl
          : undefined,
      preset: pyResult.preset || pyBody.preset,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? getErrorMessage(error) : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
