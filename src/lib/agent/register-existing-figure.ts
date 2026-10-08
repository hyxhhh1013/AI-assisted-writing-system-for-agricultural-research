/**
 * 把用户已经做好的图登记进项目图表库。
 * 不读图中数字，不生成证据声明。只有明确给出章节时才插入正文。
 */

import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { insertOrReplaceAgentSectionImage } from "@/lib/agent/chart-persist";
import { parseExplicitInsertSectionKey } from "@/lib/agent/insert-section";
import { getChartsDir } from "@/lib/charts-dir";
import { PYTHON_CMD } from "@/lib/python-cmd";
import { runCommand } from "@/lib/python-runner";
import { applyChartPatchOps } from "@/lib/project-charts";

const FIGURE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "tif", "tiff"]);
const TIFF_TO_PNG = path.join(process.cwd(), "scripts", "charts", "tiff_to_png.py");

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function isExistingFigureName(fileName: string): boolean {
  return FIGURE_EXT.has(extOf(fileName));
}

/** TIFF 先转成 PNG，视觉模型才能读图上的数。 */
export async function prepareFigureForVision(
  source: Buffer,
  originalName: string,
): Promise<{ data: Buffer; mime: string }> {
  const ext = extOf(originalName);
  if (ext === "tif" || ext === "tiff") {
    return { data: await convertTiffToPng(source), mime: "image/png" };
  }
  const mime: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  return { data: source, mime: mime[ext] ?? "image/png" };
}

export async function registerExistingFigure(opts: {
  projectId: string;
  userId: string;
  source: Buffer;
  originalName: string;
  caption: string;
  sectionKey?: string;
}): Promise<{ imageUrl: string; chartId: string; insertedSection?: string }> {
  const rawExt = extOf(opts.originalName);
  if (!FIGURE_EXT.has(rawExt)) {
    throw new Error(`「${opts.originalName}」不是可登记的图片（png/jpg/webp/gif/tiff）`);
  }
  const bytes = rawExt === "tif" || rawExt === "tiff"
    ? await convertTiffToPng(opts.source)
    : opts.source;
  const ext = rawExt === "jpeg" ? "jpg" : rawExt === "tif" || rawExt === "tiff" ? "png" : rawExt;
  const filename = `${randomUUID()}.${ext}`;
  const dir = getChartsDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), bytes);
  const imageUrl = `/api/charts/${filename}`;

  const explicit = parseExplicitInsertSectionKey(opts.sectionKey);
  const sectionKey = explicit.ok ? explicit.key : undefined;

  const charts = await applyChartPatchOps(opts.projectId, [{
    op: "append",
    asset: {
      figureId: "existing",
      caption: opts.caption.slice(0, 200) || opts.originalName,
      imageUrl,
      sectionKey,
    },
  }]);
  const chartId = charts[charts.length - 1]?.id ?? "";

  if (sectionKey) {
    await insertOrReplaceAgentSectionImage(opts.userId, opts.projectId, {
      sectionKey,
      caption: opts.caption.slice(0, 200) || opts.originalName,
      imageUrl,
    });
    return { imageUrl, chartId, insertedSection: sectionKey };
  }
  return { imageUrl, chartId };
}

async function convertTiffToPng(source: Buffer): Promise<Buffer> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gs-tiff-"));
  const src = path.join(tmp, "in.tiff");
  const dst = path.join(tmp, "out.png");
  try {
    fs.writeFileSync(src, source);
    const result = await runCommand(PYTHON_CMD, [TIFF_TO_PNG, src, dst], { timeoutMs: 30_000 });
    if (result.code !== 0 || !fs.existsSync(dst)) {
      const detail = (result.stderr || result.stdout || "转换失败").trim().slice(0, 300);
      throw new Error(`TIFF 转成 PNG 失败（${detail}）。请确认本机 Python 已安装 Pillow。`);
    }
    return fs.readFileSync(dst);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
