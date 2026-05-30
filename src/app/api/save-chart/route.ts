import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

const CHARTS_DIR = path.join(process.cwd(), "data", "charts");

if (!fs.existsSync(CHARTS_DIR)) {
  fs.mkdirSync(CHARTS_DIR, { recursive: true });
}

/**
 * 保存前端生成的图表（PNG base64）
 * POST /api/save-chart
 * Body: JSON { imageBase64: "data:image/png;base64,..." }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { imageBase64: string };
    const { imageBase64 } = body;

    if (!imageBase64 || !imageBase64.startsWith("data:image/png;base64,")) {
      return NextResponse.json({ error: "无效的图片数据" }, { status: 400 });
    }

    const base64Data = imageBase64.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const outputName = `${randomUUID()}.png`;
    const outputPath = path.join(CHARTS_DIR, outputName);
    fs.writeFileSync(outputPath, buffer);

    return NextResponse.json({
      imageBase64,
      imageUrl: `/api/charts/${outputName}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
