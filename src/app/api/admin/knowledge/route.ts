import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const where: any = {};
  if (category) where.category = category;

  const files = await prisma.knowledgeFile.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      category: true,
      documentType: true,
      size: true,
      mtime: true,
      _count: { select: { chunks: true } },
    },
  });

  // 分类统计
  const categoryStats = await prisma.knowledgeFile.groupBy({
    by: ["category"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  return NextResponse.json({
    files: files.map((f) => ({
      id: f.id,
      name: f.name,
      category: f.category,
      documentType: f.documentType,
      size: f.size,
      chunkCount: f._count.chunks,
      mtime: f.mtime?.toISOString() ?? null,
    })),
    categoryStats: categoryStats.map((c) => ({
      category: c.category,
      count: c._count.id,
    })),
    total: files.length,
  });
}
