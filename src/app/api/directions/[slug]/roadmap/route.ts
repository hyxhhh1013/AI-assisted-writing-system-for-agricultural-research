import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { directionRoadmapSchema } from "@/lib/validations";
import { callAINonStreaming } from "@/lib/ai";
import { buildRoadmapPrompt, buildAssetSummary } from "@/lib/prompts/direction";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { requireOwnedDirection } from "@/lib/direction-auth";
import type { DirectionAsset, DirectionRoadmap } from "@/contracts/direction";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseAIJson<T>(raw: string): T {
  try { return JSON.parse(raw) as T; } catch { /* continue */ }
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return JSON.parse(fenceMatch[1]) as T;
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as T;
  }
  throw new Error("无法解析 AI 返回的 JSON");
}

// ====== PATCH 更新单篇论文状态 ======

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const { candidateId, status, linkedProjectId, confirmedAt, summary } = body as {
      candidateId?: string;
      status?: string;
      linkedProjectId?: string;
      confirmedAt?: number;
      summary?: string;
    };

    const owned = await requireOwnedDirection(req, slug);
    if (!owned.ok) return owned.response;
    const direction = owned.direction;

    const currentRoadmap = (direction.roadmap as Record<string, unknown> | null) || {};

    if (!candidateId && confirmedAt === undefined && summary === undefined) {
      return NextResponse.json({ error: "缺少更新字段" }, { status: 400 });
    }

    if (confirmedAt !== undefined || summary !== undefined) {
      const cleanRoadmap = JSON.parse(JSON.stringify({
        ...currentRoadmap,
        ...(confirmedAt !== undefined && { confirmedAt }),
        ...(summary !== undefined && { summary }),
      }));
      await prisma.direction.update({
        where: { id: direction.id },
        data: { roadmap: cleanRoadmap as unknown as Prisma.InputJsonValue },
      });
      return NextResponse.json({ message: "路线图已确认", roadmap: cleanRoadmap });
    }

    if (!candidateId) {
      return NextResponse.json({ error: "缺少 candidateId" }, { status: 400 });
    }

    const papers = (currentRoadmap.papers as Array<Record<string, unknown>>) || [];

    const updatedPapers = papers.map((p) => {
      if (p.candidateId === candidateId) {
        return {
          ...p,
          ...(status !== undefined && { status }),
          ...(linkedProjectId !== undefined && { linkedProjectId }),
        };
      }
      return p;
    });

    const cleanRoadmap = JSON.parse(JSON.stringify({
      ...currentRoadmap,
      papers: updatedPapers,
    }));

    await prisma.direction.update({
      where: { id: direction.id },
      data: { roadmap: cleanRoadmap as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json({ message: "路线图状态已更新" });
  } catch (error: unknown) {
    logger.fail("roadmap PATCH failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "更新路线图失败" },
      { status: 500 },
    );
  }
}

// ====== POST 生成路线图 ======

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = await req.json();

    const { errorResponse } = await validateBody(directionRoadmapSchema, body);
    if (errorResponse) return errorResponse;

    const owned = await requireOwnedDirection(req, slug);
    if (!owned.ok) return owned.response;
    const direction = owned.direction;

    const currentAnalysis = (direction.analysis as Record<string, unknown> | null) || {};
    const dimensions = currentAnalysis.dimensions as Array<Record<string, unknown>> | undefined;

    if (!dimensions || dimensions.length === 0) {
      return NextResponse.json(
        { error: "请先完成 8 维度分析（Phase 2）" },
        { status: 400 },
      );
    }

    // 构建资产摘要
    const assets: DirectionAsset[] = Array.isArray(direction.assets)
      ? (direction.assets as unknown as DirectionAsset[])
      : [];
    const assetSummary = buildAssetSummary(assets);

    // 构建分析摘要
    const analysisSummary = dimensions
      .map((d) => `**${d.id} ${d.name || ""}**: 评分 ${d.score}/10 — ${d.summary || ""}`)
      .join("\n\n");

    // 提取论文候选
    const candidates = (currentAnalysis.paperCandidates as Array<Record<string, unknown>>) || [];
    const candidatesSummary = candidates.length > 0
      ? candidates.map((c) =>
          `- **${c.title}** (tier: ${c.tier}, 总分: ${c.overallScore})${c.suggestedJournal ? ` → ${c.suggestedJournal}` : ""}`
        ).join("\n")
      : "（无候选论文）";

    // 调用 AI 生成路线图
    const prompt = buildRoadmapPrompt(assetSummary, analysisSummary, candidatesSummary);
    const raw = await callAINonStreaming({
      provider: "deepseek",
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      timeoutMs: 60_000,
    });

    const result = parseAIJson<{
      papers: Array<{
        candidateId: string;
        priority: number;
        status: string;
        timelineQuarter?: string;
        reasoning?: string;
      }>;
      timeline: Array<{
        quarter: string;
        papers: string[];
        milestones?: string[];
      }>;
      experimentDependencies: Array<{
        description: string;
        requiredBy: string[];
        estimatedDuration: string;
      }>;
      summary?: string;
    }>(raw);

    // 保留已有论文的 linkedProjectId 和进行中的状态
    const existingPapers = ((direction.roadmap as Record<string, unknown> | null)?.papers as Array<Record<string, unknown>>) || [];
    const preservedMap = new Map<string, { status: string; linkedProjectId: string }>();
    for (const ep of existingPapers) {
      if (ep.linkedProjectId || (ep.status && ep.status !== "planned")) {
        preservedMap.set(ep.candidateId as string, {
          status: ep.status as string,
          linkedProjectId: ep.linkedProjectId as string,
        });
      }
    }

    const roadmap: DirectionRoadmap = {
      generatedAt: Date.now(),
      analysisSnapshotId: (currentAnalysis.generatedAt as number) || 0,
      summary: result.summary || "",
      papers: (result.papers || []).map((p) => {
        const preserved = preservedMap.get(p.candidateId);
        const paperStatus = (preserved?.status || p.status || "planned") as "planned" | "writing" | "submitted" | "published";
        return {
          candidateId: p.candidateId,
          priority: p.priority,
          status: paperStatus,
          linkedProjectId: (preserved?.linkedProjectId as string) || undefined,
        };
      }),
      timeline: (result.timeline || []).map((t) => ({
        quarter: t.quarter,
        papers: t.papers || [],
      })),
      experimentDependencies: (result.experimentDependencies || []).map((d) => ({
        description: d.description,
        requiredBy: d.requiredBy || [],
        estimatedDuration: d.estimatedDuration || "",
      })),
    };

    // 保存到 direction（JSON 清洗确保可序列化）
    const cleanRoadmap = JSON.parse(JSON.stringify(roadmap));
    await prisma.direction.update({
      where: { id: direction.id },
      data: { roadmap: cleanRoadmap as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json({
      roadmap,
      summary: result.summary || "",
    });
  } catch (error: unknown) {
    logger.fail("direction roadmap failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "生成路线图失败" },
      { status: 500 },
    );
  }
}
