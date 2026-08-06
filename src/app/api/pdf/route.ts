import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { SafePathError, assertSafePathSegment } from "@/lib/safe-path";
import { resolveKnowledgePdfOnDisk } from "@/lib/knowledge-metadata";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const ARTICLES_DIR = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  process.env.RAG_ARTICLES_DIR || "papers",
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("file");
    const categoryHint = searchParams.get("category") || "未分类";

    logger.info("PDF Request for:", filename);

    if (!filename) {
      return NextResponse.json({ error: "File name is required" }, { status: 400 });
    }

    assertSafePathSegment(filename, "文件名");

    const disk = resolveKnowledgePdfOnDisk(filename, categoryHint);
    const filePath = disk.path;

    if (!filePath || !fs.existsSync(filePath)) {
      logger.error(`File not found for: ${filename} categoryHint: ${categoryHint}`);
      return NextResponse.json(
        {
          error: `未找到 PDF：${filename}。若为书目导入占位，请先上传 PDF；若已上传，请检查分类是否与磁盘目录一致`,
        },
        { status: 404 },
      );
    }

    logger.info("Resolved path:", filePath);

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
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
    }
    logger.error("PDF Route Error:", error);
    const message = error instanceof Error ? getErrorMessage(error) : "请求失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
