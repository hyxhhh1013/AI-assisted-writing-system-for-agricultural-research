import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ensureBibMapLoaded } from "@/lib/rag";
import { formatReference } from "@/lib/ref-format";
import { getErrorMessage } from "@/lib/error-utils";

/**
 * 引用-文献映射管理
 *
 * GET /api/references?projectId=xxx
 *   返回项目的所有引用-文献映射
 *
 * GET /api/references?format=true&filenames=a,b,c
 *   批量格式化文件名 → GB/T 7714 引用
 *
 * POST /api/references
 *   Body: { projectId, refIndex, sourceName, category, citation }
 *   保存或更新单条映射
 *
 * POST /api/references?batch=true
 *   Body: { projectId, mappings: [{ refIndex, sourceName, category, citation }] }
 *   批量保存（用于 AI 扩写完成后持久化 refMapping）
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const refIndex = searchParams.get("refIndex");

    // 批量格式化引用
    if (searchParams.get("format") === "true") {
      const filenamesParam = searchParams.get("filenames");
      if (!filenamesParam) {
        return NextResponse.json({ error: "缺少 filenames" }, { status: 400 });
      }
      const filenames = filenamesParam.split(",").map(f => f.trim()).filter(Boolean);
      await ensureBibMapLoaded();
      const formatted: Record<string, string> = {};
      for (const filename of filenames) {
        formatted[filename] = formatFilenameToCitation(filename);
      }
      return NextResponse.json({ formatted });
    }

    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }

    const where: Prisma.ReferenceSourceWhereInput = { projectId };
    if (refIndex) {
      where.refIndex = parseInt(refIndex, 10);
    }

    const sources = await prisma.referenceSource.findMany({
      where,
      orderBy: { refIndex: "asc" },
    });

    return NextResponse.json(sources);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

function formatFilenameToCitation(filename: string): string {
  return formatReference(filename, { style: "gbt7714" });
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const isBatch = searchParams.get("batch") === "true";

    if (isBatch) {
      const { projectId, mappings } = await req.json();
      if (!projectId || !Array.isArray(mappings)) {
        return NextResponse.json({ error: "参数不完整" }, { status: 400 });
      }

      // 批量 upsert
      for (const m of mappings) {
        await prisma.referenceSource.upsert({
          where: {
            projectId_refIndex: {
              projectId,
              refIndex: m.refIndex,
            },
          },
          update: {
            sourceName: m.sourceName,
            category: m.category || "",
            citation: m.citation || "",
          },
          create: {
            projectId,
            refIndex: m.refIndex,
            sourceName: m.sourceName,
            category: m.category || "",
            citation: m.citation || "",
          },
        });
      }

      return NextResponse.json({ message: `已保存 ${mappings.length} 条引用映射` });
    }

    // 单条 upsert
    const { projectId, refIndex, sourceName, category, citation } = await req.json();
    if (!projectId || refIndex === undefined || !sourceName) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    await prisma.referenceSource.upsert({
      where: { projectId_refIndex: { projectId, refIndex } },
      update: { sourceName, category: category || "", citation: citation || "" },
      create: { projectId, refIndex, sourceName, category: category || "", citation: citation || "" },
    });

    return NextResponse.json({ message: "保存成功" });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
