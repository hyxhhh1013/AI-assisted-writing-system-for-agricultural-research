import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api-response";
import prisma from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import fs from "fs";
import path from "path";

const log = createLogger("api/presentation/stats");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChunkSumResult {
  _sum: { chunkCount: number | null };
}

export async function GET(_req: NextRequest) {
  try {
    const [total, categoryResult, chunkResult] = await Promise.all([
      prisma.knowledgeFile.count(),
      prisma.knowledgeFile.findMany({
        select: { category: true },
        distinct: ["category"],
      }),
      prisma.knowledgeFile.aggregate({
        _sum: { chunkCount: true },
      }) as Promise<ChunkSumResult>,
    ]);

    const categories = categoryResult.map((c) => c.category).filter(Boolean);
    const chunkTotal = chunkResult._sum?.chunkCount ?? 0;

    let chartCount = 14;
    try {
      const registryPath = path.join(process.cwd(), "scripts", "charts", "registry.json");
      if (fs.existsSync(registryPath)) {
        const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
        chartCount = registry?.figures?.length ?? chartCount;
      }
    } catch { /* keep fallback */ }

    return successResponse({
      knowledgeCount: total,
      categoryCount: categories.length,
      categories,
      chunkCount: chunkTotal,
      chartCount,
    });
  } catch (error: unknown) {
    log.fail("stats failed", error);
    return errorResponse("Failed to load stats");
  }
}
