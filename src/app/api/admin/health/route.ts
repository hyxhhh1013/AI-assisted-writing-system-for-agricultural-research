import { parseBibField, resolveKnowledgePdfOnDisk } from "@/lib/knowledge-metadata";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { success } from "@/lib/admin-response";
import { getAllKeys, resolveProviderModel } from "@/lib/ai";
import { MODEL_PROVIDERS, type ModelProviderKey } from "@/lib/models";
import { bibHasIssnOrJournal, parseMetricsJson } from "@/lib/journal-metrics";
import { getSetting } from "@/lib/settings";
import type { AdminJournalMetricsLastImport } from "@/contracts/admin";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

function parseLastImport(raw: string | null): AdminJournalMetricsLastImport | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as AdminJournalMetricsLastImport;
    if (typeof o.at !== "string" || typeof o.filename !== "string") return null;
    return o;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  let dbConnected = true;
  let dbProvider = "unknown";
  try {
    const result = await prisma.$queryRawUnsafe<[{ cnt: bigint }]>("SELECT COUNT(*) as cnt FROM User");
    dbConnected = result.length > 0;
  } catch {
    dbConnected = false;
  }
  try {
    const dbUrl = process.env.DATABASE_URL || "";
    dbProvider = dbUrl.startsWith("postgres")
      ? "PostgreSQL"
      : dbUrl.startsWith("file:")
        ? "SQLite"
        : "unknown";
  } catch {
    /* ignore */
  }

  const since24h = new Date(Date.now() - 24 * 3600_000);

  const [
    fileCount,
    chunkCount,
    uncategorizedCount,
    sampleFiles,
    bibMetricRows,
    agentTotal,
    agentError,
    agentError24h,
    agentRunning,
    lastImportRaw,
  ] = await Promise.all([
    prisma.knowledgeFile.count(),
    prisma.knowledgeChunk.count(),
    prisma.knowledgeFile.count({ where: { category: "未分类" } }),
    prisma.knowledgeFile.findMany({
      select: { name: true, category: true, size: true },
      take: 200,
      orderBy: { name: "asc" },
    }),
    prisma.knowledgeFile.findMany({
      select: { bib: true, metrics: true },
    }),
    prisma.agentSession.count(),
    prisma.agentSession.count({ where: { status: "error" } }),
    prisma.agentSession.count({
      where: { status: "error", updatedAt: { gte: since24h } },
    }),
    prisma.agentSession.count({ where: { status: "running" } }),
    getSetting("JOURNAL_METRICS_LAST_IMPORT"),
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

  let withImpactFactor = 0;
  let withIssnOrJournal = 0;
  let withAnyMetrics = 0;
  for (const row of bibMetricRows) {
    if (bibHasIssnOrJournal(parseBibField(row.bib))) {
      withIssnOrJournal += 1;
    }
    const m = parseMetricsJson(row.metrics);
    if (!m) continue;
    withAnyMetrics += 1;
    if (typeof m.impactFactor === "number" && Number.isFinite(m.impactFactor)) {
      withImpactFactor += 1;
    }
  }
  const coveragePct =
    fileCount > 0 ? Math.round((withImpactFactor / fileCount) * 100) : 0;

  const aiProviders = await Promise.all(
    (Object.keys(MODEL_PROVIDERS) as ModelProviderKey[]).map(async (p) => {
      const config = MODEL_PROVIDERS[p];
      const keys = await getAllKeys(p);
      const model = await resolveProviderModel(p);
      return {
        provider: p,
        name: config.name,
        keyCount: keys.length,
        model,
      };
    }),
  );
  const missingKeyProviders = aiProviders
    .filter((p) => p.keyCount === 0 && p.provider !== "vision")
    .map((p) => p.name);

  const dataDir = path.join(process.cwd(), "data");
  let indexFiles: string[] = [];
  let indexTotalSize = 0;
  try {
    if (fs.existsSync(dataDir)) {
      indexFiles = fs.readdirSync(dataDir).filter((f) => f.startsWith("index"));
      for (const f of indexFiles) {
        indexTotalSize += fs.statSync(path.join(dataDir, f)).size;
      }
    }
  } catch {
    /* ignore */
  }

  let dbSizeBytes = 0;
  try {
    const dbPath = path.join(process.cwd(), "prisma", "dev.db");
    if (fs.existsSync(dbPath)) dbSizeBytes = fs.statSync(dbPath).size;
  } catch {
    /* ignore */
  }

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
    ai: {
      providers: aiProviders,
      missingKeyProviders,
    },
    agent: {
      totalSessions: agentTotal,
      errorSessions: agentError,
      errorSessions24h: agentError24h,
      runningSessions: agentRunning,
    },
    journalMetrics: {
      fileCount,
      withAnyMetrics,
      withImpactFactor,
      coveragePct,
      withIssnOrJournal,
      lastImport: parseLastImport(lastImportRaw),
    },
  });
}
