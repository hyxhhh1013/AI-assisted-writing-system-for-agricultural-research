import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { callAINonStreaming } from "@/lib/ai";
import { buildGrantProposalPrompt } from "@/lib/prompts/direction-grant";
import { buildAssetSummary } from "@/lib/prompts/direction";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { requireOwnedDirection } from "@/lib/direction-auth";

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
    const grantType = (body.grantType as string) || "国自然面上";

    const owned = await requireOwnedDirection(req, slug);
    if (!owned.ok) return owned.response;
    const direction = owned.direction;

    const assets = Array.isArray(direction.assets) ? direction.assets : [];
    const assetSummary = buildAssetSummary(assets);

    const analysis = direction.analysis as Record<string, unknown> | null;
    const dims = analysis?.dimensions as Array<Record<string, unknown>> | undefined;
    const analysisSummary = dims
      ? dims.map((d) => `**${d.name || d.id}** (${d.score}/10): ${d.summary || ""}`).join("\n\n")
      : "（未完成分析）";

    const roadmap = direction.roadmap as Record<string, unknown> | null;
    const roadmapPapers = roadmap?.papers as Array<Record<string, unknown>> | undefined;
    const roadmapSummary = roadmapPapers
      ? `计划论文 ${roadmapPapers.length} 篇：${roadmapPapers.slice(0, 5).map((p) => `${p.priority}. ${p.candidateId} (${p.status})`).join("；")}`
      : "（未生成路线图）";

    const prompt = buildGrantProposalPrompt({
      directionName: direction.name,
      directionDesc: direction.description,
      assetSummary,
      analysisSummary,
      roadmapSummary,
      grantType,
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
      sections: Array<{
        heading: string;
        content: string;
      }>;
    }>(raw);

    return NextResponse.json({
      proposal: {
        title: result.title || `${direction.name} — ${grantType}申请书`,
        sections: result.sections || [],
        grantType,
        generatedAt: Date.now(),
      },
    });
  } catch (error: unknown) {
    logger.fail("grant proposal generation failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "生成申请失败" },
      { status: 500 },
    );
  }
}
