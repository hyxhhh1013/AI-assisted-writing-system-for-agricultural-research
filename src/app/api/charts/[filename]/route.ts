import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const DATA_CHARTS_DIR = path.join(process.cwd(), "data", "charts");
const PUBLIC_CHARTS_DIR = path.join(process.cwd(), "public", "charts");

// 安全校验：只允许 UUID.png 格式的文件名
const SAFE_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  if (!SAFE_FILENAME.test(filename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  // 优先从 data/charts/ 读取，兼容旧路径 public/charts/
  const dataPath = path.join(DATA_CHARTS_DIR, filename);
  const publicPath = path.join(PUBLIC_CHARTS_DIR, filename);

  let filePath: string | null = null;
  if (fs.existsSync(dataPath)) {
    filePath = dataPath;
  } else if (fs.existsSync(publicPath)) {
    filePath = publicPath;
  }

  if (!filePath) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
