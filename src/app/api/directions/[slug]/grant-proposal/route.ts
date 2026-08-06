import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { callAINonStreaming } from "@/lib/ai";
import { validateBody } from "@/lib/api-validate";
import { directionGrantProposalSchema } from "@/lib/validations";
import { buildGrantProposalPrompt } from "@/lib/prompts/direction-grant";
import { buildAssetSummary } from "@/lib/prompts/direction";
import { localRAG } from "@/lib/rag";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { requireOwnedDirection } from "@/lib/direction-auth";
import type { DirectionAsset, GrantProposalSnapshot, PaperCandidate } from "@/contracts/direction";

export const dynamic = "force-dynamic";

function parseAIJson<T>(raw: string): T {
  try { return JSON.parse(raw) as T; } catch { /* continue */ }
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return JSON.parse(fenceMatch[1]) as T;
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as T;
  }
  throw new Error("无法解析 AI 返回结果");
}

async function getGrantLiteratureContext(
  assets: DirectionAsset[],
  categories: string[],
): Promise<string> {
  try {
    const keywords = assets
      .filter((a) => a.kind === "experiment" || a.kind === "paper")
      .flatMap((a) => {
        if (a.kind === "experiment") {
          return [a.researchQuestion, a.keyFindings, a.title];
        }
        return [a.title, a.contribution, a.abstract?.slice(0, 100)];
      })
      .filter(Boolean)
      .slice(0, 8)
      .join(" ");

    if (!keywords.trim()) return "";

    const results = await localRAG.search(keywords, {
      limit: 6,
      ...(categories.length > 0 ? { categories } : {}),
    });

    if (!results?.length) return "";

    return results
      .slice(0, 4)
      .map((r: { metadata: { source: string }; content: string }) =>
        `[${r.metadata.source}] ${r.content.slice(0, 350)}...`)
      .join("\n\n");
  } catch {
    return "";
  }
}

/**
 * POST /api/directions/[slug]/grant-proposal
 * 从方向全景生成基金申请书
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const parsed = await validateBody(directionGrantProposalSchema, body);
    if (parsed.errorResponse) return parsed.errorResponse;
    const grantType = parsed.data.grantType;

    const owned = await requireOwnedDirection(req, slug);
    if (!owned.ok) return owned.response;
    const direction = owned.direction;

    const assets: DirectionAsset[] = Array.isArray(direction.assets)
      ? (direction.assets as unknown as DirectionAsset[])
      : [];
    const assetSummary = buildAssetSummary(assets);

    const analysis = direction.analysis as Record<string, unknown> | null;
    const dims = analysis?.dimensions as Array<Record<string, unknown>> | undefined;
    if (!dims?.length) {
      return NextResponse.json(
        { error: "请先完成 Phase 2 八维度分析" },
        { status: 400 },
      );
    }

    const analysisSummary = dims
      .map((d) => `**${d.name || d.id}** (${d.score}/10): ${d.summary || ""}`)
      .join("\n\n");

    const candidates = (analysis?.paperCandidates as PaperCandidate[] | undefined) || [];
    const roadmap = direction.roadmap as Record<string, unknown> | null;
    const roadmapPapers = roadmap?.papers as Array<{ candidateId: string; priority: number; status: string }> | undefined;

    const roadmapSummary = roadmapPapers?.length
      ? roadmapPapers
          .sort((a, b) => a.priority - b.priority)
          .slice(0, 6)
          .map((p) => {
            const c = candidates.find((x) => x.id === p.candidateId);
            return `${p.priority}. ${c?.title || p.candidateId} (${c?.tier || "—"}, ${p.status})`;
          })
          .join("；")
      : "（未生成路线图）";

    const categories = (direction.categories as string[]) || [];
    const literatureContext = await getGrantLiteratureContext(assets, categories);

    const prompt = buildGrantProposalPrompt({
      directionName: direction.name,
      directionDesc: direction.description,
      assetSummary,
      analysisSummary,
      roadmapSummary,
      grantType,
      literatureContext: literatureContext || undefined,
    });

    const raw = await callAINonStreaming({
      provider: "deepseek",
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      timeoutMs: 120_000,
    });

    const result = parseAIJson<{
      title: string;
      sections: Array<{ heading: string; content: string }>;
    }>(raw);

    const proposal: GrantProposalSnapshot = {
      title: result.title || `${direction.name} — ${grantType}申请书`,
      sections: result.sections || [],
      grantType,
      generatedAt: Date.now(),
    };

    const currentAnalysis = (direction.analysis as Record<string, unknown> | null) || {};
    const cleanAnalysis = JSON.parse(JSON.stringify({
      ...currentAnalysis,
      grantProposal: proposal,
    }));

    await prisma.direction.update({
      where: { id: direction.id },
      data: { analysis: cleanAnalysis as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json({ proposal });
  } catch (error: unknown) {
    logger.fail("grant proposal generation failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "生成申请失败" },
      { status: 500 },
    );
  }
}
