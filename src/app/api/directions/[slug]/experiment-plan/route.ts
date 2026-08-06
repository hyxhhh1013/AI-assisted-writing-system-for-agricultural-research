import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { callAINonStreaming } from "@/lib/ai";
import { buildExperimentPlanPrompt } from "@/lib/prompts/direction-experiment-plan";
import { localRAG } from "@/lib/rag";
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
 * POST /api/directions/[slug]/experiment-plan
 * 为 D6 中的一条实验缺口生成结构化的实验方案
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const gapDescription = body.gap as string | undefined;

    if (!gapDescription || gapDescription.trim().length < 10) {
      return NextResponse.json(
        { error: "请提供实验缺口描述（至少 10 字）" },
        { status: 400 },
      );
    }

    const owned = await requireOwnedDirection(req, slug);
    if (!owned.ok) return owned.response;
    const direction = owned.direction;

    // 获取方向已有实验的方法模板
    const existingAssets = Array.isArray(direction.assets)
      ? (direction.assets as unknown as Array<{ kind?: string; methods?: string }>)
      : [];
    const existingMethods = existingAssets
      .filter((a) => a.kind === "experiment" && a.methods)
      .map((a) => a.methods || "")
      .slice(0, 5);

    // RAG 检索文献方法学参考
    let literatureMethods = "";
    try {
      const results = await localRAG.search(gapDescription, { limit: 3 });
      if (results && results.length > 0) {
        literatureMethods = results
          .map((r: { content: string }, i: number) => `文献片段 ${i + 1}: ${r.content.slice(0, 300)}`)
          .join("\n\n");
      }
    } catch { /* RAG 失败不阻塞 */ }

    const prompt = buildExperimentPlanPrompt({
      gapDescription: gapDescription.trim(),
      directionName: direction.name,
      existingMethods,
      literatureMethods: literatureMethods || undefined,
    });

    const raw = await callAINonStreaming({
      provider: "deepseek",
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      timeoutMs: 60_000,
    });

    const plan = parseAIJson<{
      title: string;
      objective: string;
      rationale: string;
      methods: Array<{
        step: number;
        description: string;
        conditions: string;
        notes: string;
      }>;
      expectedResults: string;
      equipmentNeeded: string[];
      sampleRequirements: string;
      estimatedDuration: string;
      keyReferences: string[];
    }>(raw);

    return NextResponse.json({
      plan: {
        ...plan,
        generatedAt: Date.now(),
        gapDescription: gapDescription.trim(),
      },
    });
  } catch (error: unknown) {
    logger.fail("experiment plan generation failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "生成实验方案失败" },
      { status: 500 },
    );
  }
}
