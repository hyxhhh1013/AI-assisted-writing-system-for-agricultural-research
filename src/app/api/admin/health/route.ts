import { resolveKnowledgePdfOnDisk } from "@/lib/knowledge-metadata";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { success } from "@/lib/admin-response";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  // DB 状态
  let dbConnected = true;
  let dbProvider = "unknown";
  try {
    const result = await prisma.$queryRawUnsafe<[{ cnt: bigint }]>("SELECT COUNT(*) as cnt FROM User");
    dbConnected = result.length > 0;
  } catch { dbConnected = false; }
  try {
    const dbUrl = process.env.DATABASE_URL || "";
    dbProvider = dbUrl.startsWith("postgres") ? "PostgreSQL" : dbUrl.startsWith("file:") ? "SQLite" : "unknown";
  } catch { }

  // 知识库统计
  const [fileCount, chunkCount, uncategorizedCount, sampleFiles] = await Promise.all([
    prisma.knowledgeFile.count(),
    prisma.knowledgeChunk.count(),
    prisma.knowledgeFile.count({ where: { category: "未分类" } }),
    prisma.knowledgeFile.findMany({
      select: { name: true, category: true, size: true },
      take: 200,
      orderBy: { name: "asc" },
    }),
  ]);

  let pdfMissingOnDisk = 0;
  let pdfCategoryDrift = 0;
  let metadataOnly = 0;
  for (const row of sampleFiles) {
    const disk = resolveKnowledgePdfOnDisk(row.name, row.category);
    if (!disk.path) {
      if (row.size <= 0) metadataOnly += 1;
      else pdfMissingOnDisk += 1;
      continue;
    }
    if (disk.resolvedCategory && disk.resolvedCategory !== row.category) {
      pdfCategoryDrift += 1;
    }
  }

  // 索引文件
  const dataDir = path.join(process.cwd(), "data");
  let indexFiles: string[] = [];
  let indexTotalSize = 0;
  try {
    if (fs.existsSync(dataDir)) {
      indexFiles = fs.readdirSync(dataDir).filter(f => f.startsWith("index"));
      for (const f of indexFiles) {
        indexTotalSize += fs.statSync(path.join(dataDir, f)).size;
      }
    }
  } catch { }

  // DB 文件大小
  let dbSizeBytes = 0;
  try {
    const dbPath = path.join(process.cwd(), "prisma", "dev.db");
    if (fs.existsSync(dbPath)) dbSizeBytes = fs.statSync(dbPath).size;
  } catch { }

  return success({
    db: { connected: dbConnected, provider: dbProvider, sizeBytes: dbSizeBytes },
    knowledge: {
      fileCount,
      chunkCount,
      uncategorizedCount,
      diskSampleSize: sampleFiles.length,
      metadataOnlyInSample: metadataOnly,
      pdfMissingInSample: pdfMissingOnDisk,
      categoryDriftInSample: pdfCategoryDrift,
    },
    index: { indexFiles, totalSizeBytes: indexTotalSize },
    server: {
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  });
}
