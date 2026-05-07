import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const ARTICLES_DIR = path.join(process.cwd(), "热化学小组文章-2024.12.27");

function findFileInDir(dir: string, targetName: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = findFileInDir(path.join(dir, entry.name), targetName);
      if (found) return found;
    } else if (entry.name === targetName) {
      return path.join(dir, entry.name);
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("file");

    console.log("PDF Request for:", filename);

    if (!filename) {
      return NextResponse.json({ error: "File name is required" }, { status: 400 });
    }

    // 递归搜索所有子目录（文件可能存储在 ARTICLES_DIR 或子目录中）
    let filePath = path.join(ARTICLES_DIR, filename);
    if (!fs.existsSync(filePath)) {
      const found = findFileInDir(ARTICLES_DIR, filename);
      if (found) {
        filePath = found;
      }
    }
    console.log("Resolved path:", filePath);

    if (!fs.existsSync(filePath)) {
      console.error("File not found at:", filePath);
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error("PDF Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
