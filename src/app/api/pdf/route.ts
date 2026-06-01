import { logger } from "@/lib/logger";
import {
  SafePathError,
  assertResolvedInsideBase,
  assertSafePathSegment,
  resolveInsideBaseDir,
} from "@/lib/safe-path";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const ARTICLES_DIR = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  process.env.RAG_ARTICLES_DIR || "papers",
);

function findFileInDir(dir: string, targetName: string): string | null {
  assertSafePathSegment(targetName, "文件名");
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = findFileInDir(path.join(dir, entry.name), targetName);
      if (found) return found;
    } else if (entry.name === targetName) {
      const full = path.join(dir, entry.name);
      assertResolvedInsideBase(ARTICLES_DIR, full);
      return full;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("file");

    logger.info("PDF Request for:", filename);

    if (!filename) {
      return NextResponse.json({ error: "File name is required" }, { status: 400 });
    }

    assertSafePathSegment(filename, "文件名");

    // 递归搜索所有子目录（文件可能存储在 ARTICLES_DIR 或子目录中）
    let filePath = resolveInsideBaseDir(ARTICLES_DIR, filename);
    if (!fs.existsSync(filePath)) {
      const found = findFileInDir(ARTICLES_DIR, filename);
      if (found) {
        filePath = found;
      }
    }
    logger.info("Resolved path:", filePath);

    if (!fs.existsSync(filePath)) {
      logger.error("File not found at:", filePath);
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
  } catch (error: unknown) {
    if (error instanceof SafePathError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logger.error("PDF Route Error:", error);
    const message = error instanceof Error ? error.message : "请求失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
