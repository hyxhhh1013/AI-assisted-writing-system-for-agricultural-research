import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { success, paginated, parseListParams } from "@/lib/admin-response";
import { resolveProjectRuntimePath } from "@/lib/runtime-paths";
import { validateBody } from "@/lib/api-validate";
import {
  adminKnowledgeDeleteSchema,
  adminKnowledgeReindexSchema,
} from "@/lib/validations";
import { mapAdminKnowledgeFile } from "@/lib/admin-knowledge-map";

const ARTICLES_DIR = resolveProjectRuntimePath(process.env.RAG_ARTICLES_DIR || "papers");

const SORTABLE_FIELDS = new Set(["name", "category", "size", "chunkCount", "mtime"]);

function buildOrderBy(
  sortBy?: string,
  sortOrder?: "asc" | "desc",
): Prisma.KnowledgeFileOrderByWithRelationInput {
  const field = sortBy && SORTABLE_FIELDS.has(sortBy) ? sortBy : "name";
  const dir = sortOrder === "desc" ? "desc" : "asc";
  if (field === "chunkCount") return { chunkCount: dir };
  if (field === "mtime") return { mtime: dir };
  if (field === "size") return { size: dir };
  if (field === "category") return { category: dir };
  return { name: dir };
}

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const params = parseListParams(searchParams);
  const q = params.q || "";
  const category = params.category || "";
  const indexStatus = params.indexStatus || "";

  const where: Prisma.KnowledgeFileWhereInput = {};
  if (q) where.name = { contains: q };
  if (category) where.category = category;

  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;

  const [allForCats, rawFiles] = await Promise.all([
    prisma.knowledgeFile.groupBy({
      by: ["category"],
      _count: true,
      orderBy: { _count: { category: "desc" } },
    }),
    prisma.knowledgeFile.findMany({
      where,
      orderBy: indexStatus ? { name: "asc" } : buildOrderBy(params.sortBy, params.sortOrder),
      ...(indexStatus
        ? {}
        : { skip: (page - 1) * pageSize, take: pageSize }),
      include: { _count: { select: { chunks: true } } },
    }),
  ]);

  let mapped = rawFiles.map((f) =>
    mapAdminKnowledgeFile({
      id: f.id,
      name: f.name,
      category: f.category,
      documentType: f.documentType,
      size: f.size,
      mtime: f.mtime,
      bib: f.bib,
      bibEdited: f.bibEdited,
      parseWarning: f.parseWarning,
      chunkCount: f.chunkCount,
      chunkRowCount: f._count.chunks,
    }),
  );

  let total: number;
  if (indexStatus) {
    mapped = mapped.filter((f) => f.indexStatus === indexStatus);
    total = mapped.length;
    mapped = mapped.slice((page - 1) * pageSize, page * pageSize);
  } else {
    total = await prisma.knowledgeFile.count({ where });
  }

  const response = paginated(mapped, total, params);
  const body = (await response.json()) as Record<string, unknown>;
  return NextResponse.json({
    ...body,
    categoryStats: allForCats.map((c) => ({ category: c.category, count: c._count })),
  });
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const { data, errorResponse: ve } = await validateBody(adminKnowledgeDeleteSchema, body);
  if (ve) return ve;
  const { name, category, files: bulkFiles } = data;
  const toDelete: { name: string; category: string }[] =
    bulkFiles?.map((f) => ({ name: f.name, category: f.category || "未分类" }))
    ?? [{ name: name!, category: category || "未分类" }];

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

  const body = await req.json().catch(() => null);
  const { data, errorResponse: ve } = await validateBody(adminKnowledgeReindexSchema, body);
  if (ve) return ve;
  const { name, forceStage1, forceStage3 } = data;

  const { reindexKnowledge } = await import("@/services/knowledge");
  reindexKnowledge({ files: [name], forceStage1, forceStage3 }).catch(() => {});

  return success(undefined, `已触发「${name}」重索引`);
}
