import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { success, badRequest } from "@/lib/admin-response";

const ARTICLES_DIR = path.join(process.cwd(), process.env.RAG_ARTICLES_DIR || "papers");

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const category = searchParams.get("category") || "";

  const where: any = {};
  if (q) where.name = { contains: q };
  if (category) where.category = category;

  const [files, allForCats] = await Promise.all([
    prisma.knowledgeFile.findMany({
      where,
      orderBy: { name: "asc" },
      include: { _count: { select: { chunks: true } } },
    }),
    prisma.knowledgeFile.groupBy({ by: ["category"], _count: true, orderBy: { _count: { category: "desc" } } }),
  ]);

  return NextResponse.json({
    files: files.map(f => ({
      id: f.id,
      name: f.name,
      category: f.category,
      documentType: f.documentType,
      size: f.size,
      chunkCount: f._count.chunks,
      mtime: f.mtime?.toISOString() ?? null,
    })),
    categoryStats: allForCats.map(c => ({ category: c.category, count: c._count })),
    total: files.length,
  });
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json();
  const { name, category, files: bulkFiles } = body;
  const toDelete: { name: string; category: string }[] = bulkFiles || [{ name, category }].filter((f: any) => f.name);
  if (!toDelete.length) return badRequest("缺少文件信息");

  let deletedDisk = 0;
  for (const f of toDelete) {
    try {
      const fp = path.join(ARTICLES_DIR, f.category === "未分类" ? "" : f.category, f.name);
      if (fs.existsSync(fp)) { fs.unlinkSync(fp); deletedDisk++; }
    } catch {}
    await prisma.knowledgeFile.deleteMany({ where: { name: f.name } });
  }

  return success(undefined, `已删除 ${toDelete.length} 篇（磁盘 ${deletedDisk} 个文件），索引需重建`);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json();
  const { name, forceStage1, forceStage3 } = body;
  if (!name) return badRequest("缺少文件名");

  const { reindexKnowledge } = await import("@/services/knowledge");
  reindexKnowledge({ files: [name], forceStage1, forceStage3 }).catch(() => {});

  return success(undefined, `已触发「${name}」重索引`);
}
