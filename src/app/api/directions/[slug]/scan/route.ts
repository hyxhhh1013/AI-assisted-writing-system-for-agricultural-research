import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { PaperAsset, DatasetAsset } from "@/contracts/direction";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { requireOwnedDirection } from "@/lib/direction-auth";

/** 扫描候选资产：从 KnowledgeFile / Project / DataClaims 中提取 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const owned = await requireOwnedDirection(req, slug);
    if (!owned.ok) return owned.response;
    const direction = owned.direction;

    const categories = direction.categories as string[];

    // 1. 从知识库扫描论文资产
    const kbFiles = await prisma.knowledgeFile.findMany({
      where: { category: { in: categories } },
      orderBy: { name: "asc" },
      take: 200,
    });

    const paperCandidates: PaperAsset[] = [];
    for (const f of kbFiles) {
      let bib: Record<string, unknown> | null = null;
      try {
        bib = typeof f.bib === "string" ? JSON.parse(f.bib) : (f.bib as Record<string, unknown> | null);
      } catch { /* ignore parse errors */ }

      if (bib) {
        paperCandidates.push({
          id: `auto-paper-${f.id}`,
          kind: "paper",
          doi: (bib.doi as string) || "",
          title: (bib.title as string) || f.name,
          journal: (bib.journal as string) || "",
          year: (bib.year as number) || 0,
          impactFactor: (() => {
            try {
              const m = typeof f.metrics === "string" ? JSON.parse(f.metrics) : f.metrics;
              return (m as Record<string, unknown> | null)?.impactFactor as number | undefined;
            } catch { return undefined; }
          })(),
          abstract: "",
          contribution: "",
          linkedExperiments: [],
          source: "knowledge_base",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    // 2. 从现有项目扫描论文资产
    const projects = await prisma.project.findMany({
      where: { researchDirection: slug, userId: owned.userId },
      orderBy: { lastUpdated: "desc" },
      take: 50,
    });

    const projectCandidates: PaperAsset[] = projects.map((p) => ({
      id: `auto-project-${p.id}`,
      kind: "paper" as const,
      doi: "",
      title: p.title || "未命名项目",
      journal: "",
      year: new Date(p.createdAt).getFullYear(),
      abstract: p.abstract || "",
      contribution: "",
      linkedExperiments: [],
      source: "existing_project" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    // 3. 从数据声明扫描数据集资产
    const datasetCandidates: DatasetAsset[] = [];
    for (const p of projects) {
      if (!p.dataSources) continue;
      try {
        const claims = typeof p.dataSources === "string"
          ? JSON.parse(p.dataSources)
          : p.dataSources;
        const arr = Array.isArray(claims) ? claims : [];
        for (const claim of arr) {
          if (claim?.variable || claim?.label) {
            datasetCandidates.push({
              id: `auto-dataset-${p.id}-${datasetCandidates.length}`,
              kind: "dataset",
              title: `${p.title} — ${claim.label || claim.variable || "未命名数据"}`,
              variables: claim.variable || claim.label || "",
              sampleSize: claim.sampleSize || claim.n,
              linkedExperiments: [],
              source: "existing_data_claims",
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
          }
        }
      } catch { /* ignore parse errors */ }
    }

    return NextResponse.json({
      paperCandidates,
      projectCandidates,
      datasetCandidates,
      summary: {
        knowledgeBasePapers: paperCandidates.length,
        existingProjects: projectCandidates.length,
        dataClaims: datasetCandidates.length,
      },
    });
  } catch (error: unknown) {
    logger.fail("direction scan failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "扫描候选资产失败" },
      { status: 500 },
    );
  }
}
