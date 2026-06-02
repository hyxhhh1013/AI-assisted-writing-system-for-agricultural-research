import { logger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";
import { getErrorMessage } from "@/lib/error-utils";
import {
  SafePathError,
  resolveKnowledgeCategoryDir,
  resolveKnowledgeFilePath,
} from "@/lib/safe-path";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import prisma from "@/lib/prisma";
import type { KnowledgeFileRecord } from "@/contracts/knowledge";
import { prismaRowToKnowledgeRecord } from "@/lib/knowledge-metadata";
import { localRAG, invalidateBibCache } from "@/lib/rag";
import { validateBody } from "@/lib/api-validate";
import {
  knowledgeBatchMoveSchema,
  knowledgeCategoryPatchSchema,
  knowledgeDeleteBatchSchema,
  knowledgeDeleteQuerySchema,
  knowledgeMetadataPatchSchema,
  knowledgeUploadFieldsSchema,
} from "@/lib/validations";

const ARTICLES_DIR = path.join(process.cwd(), process.env.RAG_ARTICLES_DIR || "papers");

// ====== GET ======

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const query = searchParams.get("q")?.toLowerCase();
    const searchType = searchParams.get("type") || "name";
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "10");

    if (searchType === "semantic" && query) {
      const cat = category && category !== "全部" ? category : undefined;
      const results = await localRAG.search(query, { limit: 50, category: cat });
      const grouped = new Map<string, { name: string; category: string; chunks: typeof results }>();
      for (const r of results) {
        const key = r.metadata.source;
        if (!grouped.has(key)) grouped.set(key, { name: key, category: r.metadata.category, chunks: [] });
        grouped.get(key)!.chunks.push(r);
      }
      const sources = Array.from(grouped.values()).sort((a, b) => b.chunks.length - a.chunks.length);
      const total = sources.length;
      const paged = sources.slice((page - 1) * pageSize, page * pageSize);
      return NextResponse.json({
        files: await Promise.all(paged.map(async (g) => {
          const db = await prisma.knowledgeFile.findUnique({ where: { name: g.name } });
          if (db) {
            const r = prismaRowToKnowledgeRecord({
              ...db,
              chunkCount: g.chunks.length,
              _count: { chunks: g.chunks.length },
            });
            r._snippets = g.chunks.map(c => c.content.slice(0, 300));
            return r;
          }
          return { name: g.name, category: g.category, documentType: "paper", chunkCount: g.chunks.length, size: 0, mtime: "", _snippets: g.chunks.map(c => c.content.slice(0, 300)) };
        })),
        total, page, pageSize, searchType: "semantic", categories: [],
      });
    }

    // 主路径：从 Prisma 读
    const where: Prisma.KnowledgeFileWhereInput = {};
    if (category && category !== "全部") where.category = category;
    if (query) where.OR = [{ name: { contains: query } }, { category: { contains: query } }];

    const [files, total] = await Promise.all([
      prisma.knowledgeFile.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { chunks: true } } },
      }),
      prisma.knowledgeFile.count({ where }),
    ]);

    const allCategories = await prisma.knowledgeFile.groupBy({ by: ["category"], _count: true, orderBy: { _count: { category: "desc" } } });

    return NextResponse.json({
      files: files.map((f) => prismaRowToKnowledgeRecord(f)),
      total, page, pageSize,
      categories: ["全部", ...allCategories.map(c => c.category)],
      searchType: "name",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? getErrorMessage(error) : "请求失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ====== POST (upload) ======

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");
    if (action === "reindex") {
      return NextResponse.json({ error: "请使用 POST /api/knowledge/reindex 获取流式进度" }, { status: 410 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "未发现上传文件" }, { status: 400 });
    }

    const categoryRaw = formData.get("category");
    const documentTypeRaw = formData.get("documentType");
    const { data: uploadFields, errorResponse: fieldError } = await validateBody(
      knowledgeUploadFieldsSchema,
      {
        category: typeof categoryRaw === "string" ? categoryRaw : undefined,
        documentType: typeof documentTypeRaw === "string" ? documentTypeRaw : undefined,
      },
    );
    if (fieldError) return fieldError;
    const { category, documentType } = uploadFields;

    const buffer = Buffer.from(await file.arrayBuffer());
    const targetPath = resolveKnowledgeFilePath(ARTICLES_DIR, category, file.name);
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetPath, buffer);

    try {
      await prisma.knowledgeFile.upsert({
        where: { name: file.name },
        update: { category, documentType, size: buffer.length, mtime: new Date() },
        create: {
          name: file.name,
          category,
          documentType,
          size: buffer.length,
          mtime: new Date(),
          chunkCount: 0,
        },
      });
      invalidateBibCache();
    } catch (e) {
      logger.error("Prisma upsert failed:", e);
    }

    return NextResponse.json({ message: "文件上传成功", name: file.name });
  } catch (error: unknown) {
    if (error instanceof SafePathError) {
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
    }
    logger.error("Knowledge API error:", error);
    return NextResponse.json({ error: (error as Error).message || "上传失败" }, { status: 500 });
  }
}

// ====== PATCH ======

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "update_metadata") {
      const { data: parsed, errorResponse: ve } = await validateBody(knowledgeMetadataPatchSchema, body);
      if (ve) return ve;

      // 更新 Prisma
      await prisma.knowledgeFile.updateMany({
        where: { name: parsed.name },
        data: {
          documentType: parsed.documentType || undefined,
          gbTag: parsed.gbTag || undefined,
          bib: parsed.bib ? JSON.stringify(parsed.bib) : undefined,
          bibEdited: true,
        },
      });

      invalidateBibCache();
      return NextResponse.json({ message: "书目信息已保存" });
    }

    if (action === "batch_move") {
      const { data: moveData, errorResponse: ve } = await validateBody(knowledgeBatchMoveSchema, body);
      if (ve) return ve;
      const { files, newCategory } = moveData;
      const newDir = resolveKnowledgeCategoryDir(ARTICLES_DIR, newCategory);
      if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });
      let ok = 0, fail = 0;
      for (const f of files) {
        try {
          const oldPath = resolveKnowledgeFilePath(ARTICLES_DIR, f.category, f.name);
          const destPath = resolveKnowledgeFilePath(ARTICLES_DIR, newCategory, f.name);
          if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, destPath);
            ok++;
          } else fail++;
        } catch { fail++; }
      }
      // 更新 Prisma
      for (const f of files) {
        await prisma.knowledgeFile.updateMany({ where: { name: f.name }, data: { category: newCategory } });
      }
      invalidateBibCache();
      return NextResponse.json({ message: `批量移动完成：成功 ${ok}，失败 ${fail}` });
    }

    // 单文件分类修改
    const { data: categoryData, errorResponse: categoryError } = await validateBody(
      knowledgeCategoryPatchSchema,
      body,
    );
    if (categoryError) return categoryError;
    const { name, oldCategory, newCategory, documentType } = categoryData;

    let oldPath = resolveKnowledgeFilePath(ARTICLES_DIR, oldCategory, name);
    if (!fs.existsSync(oldPath)) {
      for (const entry of fs.readdirSync(ARTICLES_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        try {
          const c = resolveKnowledgeFilePath(ARTICLES_DIR, entry.name, name);
          if (fs.existsSync(c)) {
            oldPath = c;
            break;
          }
        } catch {
          continue;
        }
      }
    }
    if (!fs.existsSync(oldPath)) return NextResponse.json({ error: `文件不存在: ${name}` }, { status: 404 });

    const newDir = resolveKnowledgeCategoryDir(ARTICLES_DIR, newCategory);
    if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });
    fs.renameSync(oldPath, resolveKnowledgeFilePath(ARTICLES_DIR, newCategory, name));

    // 更新 Prisma
    await prisma.knowledgeFile.updateMany({ where: { name }, data: { category: newCategory, ...(documentType ? { documentType } : {}) } });

    invalidateBibCache();
    return NextResponse.json({ message: "分类更新成功" });
  } catch (error: unknown) {
    if (error instanceof SafePathError) {
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
    }
    return NextResponse.json({ error: (error as Error).message || "更新失败" }, { status: 500 });
  }
}

// ====== DELETE ======

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");
    const category = searchParams.get("category");
    const isBatch = searchParams.get("batch") === "true";

    if (isBatch) {
      const { data: batchData, errorResponse: ve } = await validateBody(
        knowledgeDeleteBatchSchema,
        await req.json(),
      );
      if (ve) return ve;
      const { files } = batchData;
      let deleted = 0;
      for (const f of files) {
        try {
          const fp = resolveKnowledgeFilePath(ARTICLES_DIR, f.category, f.name);
          if (fs.existsSync(fp)) {
            fs.unlinkSync(fp);
            deleted++;
          }
          await prisma.knowledgeFile.deleteMany({ where: { name: f.name } });
        } catch (e) {
          if (e instanceof SafePathError) {
            return NextResponse.json({ error: e.message }, { status: 400 });
          }
          throw e;
        }
      }
      invalidateBibCache();
      return NextResponse.json({ message: `删除 ${deleted} 个文件` });
    }

    const { data: deleteQuery, errorResponse: queryError } = await validateBody(
      knowledgeDeleteQuerySchema,
      { name, category },
    );
    if (queryError) return queryError;
    const fp = resolveKnowledgeFilePath(ARTICLES_DIR, deleteQuery.category, deleteQuery.name);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    await prisma.knowledgeFile.deleteMany({ where: { name: deleteQuery.name } });
    invalidateBibCache();
    return NextResponse.json({ message: "文件已删除" });
  } catch (error: unknown) {
    if (error instanceof SafePathError) {
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
    }
    return NextResponse.json({ error: (error as Error).message || "删除失败" }, { status: 500 });
  }
}
